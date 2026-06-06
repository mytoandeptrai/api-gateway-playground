import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityMetadata, Repository } from 'typeorm';
import {
  RestoreLog,
  RestoreMode,
  RestoreStatus,
} from '../entities/restore-log.entity';
import { BackupLog, BackupStatus } from '../entities/backup-log.entity';
import { EncryptionService } from './encryption.service';
import { GoogleDriveService } from './google-drive.service';
import { BackupPayload } from './backup.service';
import { KafkaProducer } from '@/shared/kafka/utils/kafka.producer';

const EXCLUDED_TABLES = new Set([
  'backup_logs',
  'restore_logs',
  'migrations_api',
]);

@Injectable()
export class RestoreService {
  private readonly logger = new Logger(RestoreService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
    private readonly googleDriveService: GoogleDriveService,
    private readonly kafkaProducer: KafkaProducer,
    @InjectRepository(RestoreLog)
    private readonly restoreLogRepo: Repository<RestoreLog>,
    @InjectRepository(BackupLog)
    private readonly backupLogRepo: Repository<BackupLog>,
  ) {}

  async createRestoreLog(
    backupId: string,
    userEmail: string,
    collections: string[],
    mode: RestoreMode,
  ): Promise<RestoreLog> {
    const log = this.restoreLogRepo.create({
      backupId,
      userEmail,
      collections,
      mode,
    });
    return this.restoreLogRepo.save(log);
  }

  async executeRestore(restoreId: string): Promise<void> {
    const log = await this.restoreLogRepo.findOneByOrFail({ restoreId });
    const backup = await this.backupLogRepo.findOneBy({
      backupId: log.backupId,
    });

    if (!backup || backup.status !== BackupStatus.SUCCESS) {
      throw new NotFoundException(
        `Backup ${log.backupId} not found or not successful`,
      );
    }

    const collectionStats: Record<
      string,
      { restored: number; errors: number }
    > = {};
    const id = log.restoreId;

    try {
      this.logger.log(`[${id}] Downloading backup file from Drive...`);
      const encrypted = await this.googleDriveService.download(backup.fileId!);
      this.logger.log(`[${id}] Decrypting payload...`);
      const json = this.encryptionService.decrypt(encrypted);
      const payload = JSON.parse(json) as BackupPayload;

      const targetCollections =
        log.collections.length > 0
          ? log.collections.filter((c) => !EXCLUDED_TABLES.has(c))
          : Object.keys(payload.collections).filter(
              (c) => !EXCLUDED_TABLES.has(c),
            );

      this.logger.log(
        `[${id}] Target collections: [${targetCollections.join(', ')}]`,
      );

      // Pre-validate: separate valid tables from missing ones before touching the DB
      const validMetas: EntityMetadata[] = [];
      let hasPartial = false;

      for (const tableName of targetCollections) {
        const rows = payload.collections[tableName];
        const meta = this.getEntityMetaByTable(tableName);
        if (!rows || !meta) {
          collectionStats[tableName] = { restored: 0, errors: 1 };
          hasPartial = true;
          this.logger.warn(
            `[${id}] Skipping ${tableName}: not found in backup payload or entity metadata`,
          );
          continue;
        }
        validMetas.push(meta);
      }

      // Sort metas so parents come before children (required for save order)
      const sortedMetas = this.sortByDependencies(validMetas);
      this.logger.log(
        `[${id}] Restore order: [${sortedMetas.map((m) => m.tableName).join(' → ')}]`,
      );

      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();
      this.logger.log(`[${id}] Transaction started`);

      try {
        if (log.mode === RestoreMode.REPLACE) {
          // DELETE children first — TRUNCATE fails on FK-referenced tables in PostgreSQL
          const deleteOrder = [...sortedMetas].reverse();
          this.logger.log(
            `[${id}] REPLACE — delete order: [${deleteOrder.map((m) => m.tableName).join(' → ')}]`,
          );
          for (const meta of deleteOrder) {
            this.logger.log(`[${id}] Deleting table: ${meta.tableName}`);
            await queryRunner.manager
              .createQueryBuilder()
              .delete()
              .from(meta.target as never)
              .execute();
            this.logger.log(`[${id}] Deleted: ${meta.tableName}`);
          }
        }

        // Insert parents first to satisfy FK constraints.
        // Use raw parameterized SQL to explicitly include ALL columns (including PKs).
        // TypeORM's query builder skips PrimaryGeneratedColumn values when building
        // INSERT — restored rows get new auto-generated IDs instead of original ones,
        // breaking FK references in child tables.
        for (const meta of sortedMetas) {
          const rows = payload.collections[meta.tableName];
          this.logger.log(
            `[${id}] Inserting ${rows.length} rows into ${meta.tableName}...`,
          );

          const cols = meta.columns;
          const colsSql = cols.map((c) => `"${c.databaseName}"`).join(', ');
          const pkCols = meta.primaryColumns.map((c) => `"${c.databaseName}"`);

          const params: unknown[] = [];
          const valueSets: string[] = [];
          for (const row of rows as Record<string, unknown>[]) {
            const placeholders = cols.map((c) => {
              params.push(row[c.propertyName] ?? null);
              return `$${params.length}`;
            });
            valueSets.push(`(${placeholders.join(', ')})`);
          }

          if (log.mode === RestoreMode.REPLACE) {
            await queryRunner.query(
              `INSERT INTO "${meta.tableName}" (${colsSql}) VALUES ${valueSets.join(', ')}`,
              params,
            );
          } else {
            const updateSql = cols
              .filter((c) => !c.isPrimary)
              .map((c) => `"${c.databaseName}" = EXCLUDED."${c.databaseName}"`)
              .join(', ');
            await queryRunner.query(
              `INSERT INTO "${meta.tableName}" (${colsSql}) VALUES ${valueSets.join(', ')} ON CONFLICT (${pkCols.join(', ')}) DO UPDATE SET ${updateSql}`,
              params,
            );
          }

          collectionStats[meta.tableName] = {
            restored: rows.length,
            errors: 0,
          };
          this.logger.log(`[${id}] Inserted ${meta.tableName} ✓`);
        }

        await queryRunner.commitTransaction();
        this.logger.log(`[${id}] Transaction committed`);
      } catch (err) {
        this.logger.error(
          `[${id}] Transaction failed, rolling back`,
          err instanceof Error ? err.message : String(err),
        );
        await queryRunner.rollbackTransaction();
        throw err;
      } finally {
        await queryRunner.release();
      }

      log.collectionStats = collectionStats;
      log.endTime = new Date();
      log.status = hasPartial ? RestoreStatus.PARTIAL : RestoreStatus.SUCCESS;
      await this.restoreLogRepo.save(log);
      this.logger.log(`[${id}] Restore completed with status: ${log.status}`);
      await this.sendNotification(log);
    } catch (err) {
      log.status = RestoreStatus.FAILED;
      log.endTime = new Date();
      log.error = err instanceof Error ? err.message : String(err);
      log.collectionStats = collectionStats;
      await this.restoreLogRepo.save(log);
      await this.sendNotification(log);
      throw err;
    }
  }

  private async sendNotification(log: RestoreLog): Promise<void> {
    try {
      const recipients = this.configService.get<string>(
        'backup.notificationEmails',
        '',
      );
      const emails = recipients
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean);
      if (emails.length === 0) return;

      const data = {
        restoreId: log.restoreId,
        backupId: log.backupId,
        status: log.status,
        mode: log.mode,
        collections: log.collections,
        collectionStats: log.collectionStats,
        startTime: log.startTime,
        endTime: log.endTime,
        error: log.error,
      };

      const messages = emails.map((email) => ({
        key: log.restoreId,
        value: JSON.stringify({
          eventId: `restore:${log.restoreId}:${email}`,
          sagaId: '',
          orderId: '',
          userId: email,
          payload: {
            eventId: `restore:${log.restoreId}:${email}`,
            userId: email,
            email,
            template: 'restore-result',
            data,
            channels: ['email'],
          },
        }),
      }));

      await this.kafkaProducer.send({ topic: 'notification.send', messages });
    } catch (err) {
      this.logger.error(
        'Failed to send restore notification',
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  // Topological sort: parents before children based on FK metadata
  private sortByDependencies(metas: EntityMetadata[]): EntityMetadata[] {
    const visited = new Set<EntityMetadata>();
    const sorted: EntityMetadata[] = [];

    const visit = (meta: EntityMetadata) => {
      if (visited.has(meta)) return;
      visited.add(meta);
      for (const fk of meta.foreignKeys) {
        const dep = metas.find(
          (m) => m.target === fk.referencedEntityMetadata.target,
        );
        if (dep) visit(dep);
      }
      sorted.push(meta);
    };

    for (const meta of metas) visit(meta);
    return sorted;
  }

  private getEntityMetaByTable(tableName: string): EntityMetadata | undefined {
    return this.dataSource.entityMetadatas.find(
      (m) => m.tableName === tableName,
    );
  }

  async findHistory(filters: {
    status?: RestoreStatus;
    mode?: RestoreMode;
    search?: string;
    startDate?: string;
    endDate?: string;
    page: number;
    limit: number;
  }): Promise<{ data: RestoreLog[]; total: number }> {
    const qb = this.restoreLogRepo.createQueryBuilder('r');
    if (filters.status)
      qb.andWhere('r.status = :status', { status: filters.status });
    if (filters.mode) qb.andWhere('r.mode = :mode', { mode: filters.mode });
    if (filters.search)
      qb.andWhere('r.backupId ILIKE :s OR r.userEmail ILIKE :s', {
        s: `%${filters.search}%`,
      });
    if (filters.startDate)
      qb.andWhere('r.startTime >= :startDate', {
        startDate: filters.startDate,
      });
    if (filters.endDate)
      qb.andWhere('r.startTime <= :endDate', { endDate: filters.endDate });
    qb.orderBy('r.startTime', 'DESC')
      .skip((filters.page - 1) * filters.limit)
      .take(filters.limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(restoreId: string): Promise<RestoreLog> {
    return this.restoreLogRepo.findOneByOrFail({ restoreId });
  }
}
