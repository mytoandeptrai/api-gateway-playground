import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource, EntityMetadata, Repository } from 'typeorm';
import { BackupLog, BackupStatus } from '../entities/backup-log.entity';
import { RestoreLog, RestoreMode } from '../entities/restore-log.entity';
import { EncryptionService } from './encryption.service';
import { GoogleDriveService } from './google-drive.service';
import { RetentionService } from './retention.service';
import { RestoreService } from './restore.service';
import { KafkaProducer } from '@/shared/kafka/utils/kafka.producer';
import {
  BACKUP_JOB,
  BACKUP_QUEUE,
  RESTORE_JOB,
  RESTORE_QUEUE,
} from '../backup.constants';

export interface BackupPayload {
  backupId: string;
  createdAt: string;
  collections: Record<string, unknown[]>;
  metadata: {
    service: string;
    collections: string[];
    totalRows: number;
  };
}

const EXCLUDED_TABLES = new Set([
  'backup_logs',
  'restore_logs',
  'migrations_api',
]);

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly encryptionService: EncryptionService,
    private readonly googleDriveService: GoogleDriveService,
    private readonly retentionService: RetentionService,
    private readonly restoreService: RestoreService,
    private readonly kafkaProducer: KafkaProducer,
    @InjectQueue(BACKUP_QUEUE) private readonly backupQueue: Queue,
    @InjectQueue(RESTORE_QUEUE) private readonly restoreQueue: Queue,
    @InjectRepository(BackupLog)
    private readonly backupLogRepo: Repository<BackupLog>,
  ) {}

  async triggerBackup(): Promise<{ backupId: string; status: BackupStatus }> {
    const log = await this.createBackupLog(false);
    await this.backupQueue.add(BACKUP_JOB, { backupId: log.backupId });
    return { backupId: log.backupId, status: log.status };
  }

  async triggerRestore(
    backupId: string,
    userEmail: string,
    mode: RestoreMode,
  ): Promise<{ restoreId: string; status: RestoreLog['status'] }> {
    const collections = await this.getCollections(backupId);
    const log = await this.restoreService.createRestoreLog(
      backupId,
      userEmail,
      collections,
      mode,
    );
    await this.restoreQueue.add(RESTORE_JOB, { restoreId: log.restoreId });
    return { restoreId: log.restoreId, status: log.status };
  }

  async triggerSelectiveRestore(
    backupId: string,
    userEmail: string,
    collections: string[],
    mode: RestoreMode,
  ): Promise<{ restoreId: string; status: RestoreLog['status'] }> {
    const log = await this.restoreService.createRestoreLog(
      backupId,
      userEmail,
      collections,
      mode,
    );
    await this.restoreQueue.add(RESTORE_JOB, { restoreId: log.restoreId });
    return { restoreId: log.restoreId, status: log.status };
  }

  async findRestoreHistory(
    filters: Parameters<RestoreService['findHistory']>[0],
  ) {
    return this.restoreService.findHistory(filters);
  }

  async findOneRestore(restoreId: string) {
    return this.restoreService.findOne(restoreId);
  }

  async createBackupLog(isAutomatic: boolean): Promise<BackupLog> {
    const log = this.backupLogRepo.create({ isAutomatic });
    return this.backupLogRepo.save(log);
  }

  async executeBackup(backupId: string): Promise<void> {
    this.logger.log(`[${backupId}] Loading backup log from DB...`);
    const log = await this.backupLogRepo.findOneByOrFail({ backupId });

    try {
      this.logger.log(`[${backupId}] Dumping collections...`);
      const collections = await this.dumpCollections(backupId);
      const totalRows = Object.values(collections).reduce(
        (acc, rows) => acc + rows.length,
        0,
      );
      this.logger.log(
        `[${backupId}] Dump complete — tables: [${Object.keys(collections).join(', ')}], rows: ${totalRows}`,
      );

      this.logger.log(`[${backupId}] Serializing & encrypting...`);
      const payload: BackupPayload = {
        backupId,
        createdAt: new Date().toISOString(),
        collections,
        metadata: {
          service: 'api',
          collections: Object.keys(collections),
          totalRows,
        },
      };
      const json = JSON.stringify(payload);
      const encrypted = this.encryptionService.encrypt(json);
      const filename = `backup-api-${backupId}-${Date.now()}.enc`;
      this.logger.log(
        `[${backupId}] Encrypted payload size: ${Buffer.byteLength(encrypted, 'utf8')} bytes`,
      );

      this.logger.log(`[${backupId}] Uploading to Google Drive...`);
      const { fileId, webViewLink } = await this.googleDriveService.upload(
        filename,
        encrypted,
      );
      this.logger.log(`[${backupId}] Upload done — fileId: ${fileId}`);

      log.status = BackupStatus.SUCCESS;
      log.endTime = new Date();
      log.size = Buffer.byteLength(encrypted, 'utf8');
      log.fileId = fileId;
      log.location = webViewLink;
      log.metadata = { collections: Object.keys(collections), totalRows };
      await this.backupLogRepo.save(log);
      this.logger.log(`[${backupId}] Backup log saved (SUCCESS)`);

      this.logger.log(`[${backupId}] Enforcing retention policy...`);
      await this.retentionService.enforceRetention();

      this.logger.log(`[${backupId}] Sending notification...`);
      await this.sendNotification(log);
      this.logger.log(`[${backupId}] Done`);
    } catch (err) {
      this.logger.error(
        `[${backupId}] Backup failed`,
        err instanceof Error ? err.stack : JSON.stringify(err),
      );
      log.status = BackupStatus.FAILED;
      log.endTime = new Date();
      log.error =
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Unknown error';
      await this.backupLogRepo.save(log);
      await this.sendNotification(log);
      throw err;
    }
  }

  private async dumpCollections(
    backupId: string,
  ): Promise<Record<string, unknown[]>> {
    const result: Record<string, unknown[]> = {};
    const entityMetas: EntityMetadata[] = this.dataSource.entityMetadatas;

    for (const meta of entityMetas) {
      if (EXCLUDED_TABLES.has(meta.tableName)) continue;
      this.logger.log(`[${backupId}] Dumping table: ${meta.tableName}`);
      const rows = await this.dataSource.manager.find(meta.target as never);
      this.logger.log(`[${backupId}] → ${rows.length} rows`);
      result[meta.tableName] = rows;
    }
    return result;
  }

  private async sendNotification(log: BackupLog): Promise<void> {
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

      const notificationData = {
        backupId: log.backupId,
        status: log.status,
        startTime: log.startTime,
        endTime: log.endTime,
        size: log.size,
        error: log.error,
        isAutomatic: log.isAutomatic,
      };

      const messages = emails.map((email) => ({
        key: log.backupId,
        value: JSON.stringify({
          eventId: `backup:${log.backupId}:${email}`,
          sagaId: '',
          orderId: '',
          userId: email,
          payload: {
            eventId: `backup:${log.backupId}:${email}`,
            userId: email,
            email,
            template: 'backup-result',
            data: notificationData,
            channels: ['email'],
          },
        }),
      }));

      await this.kafkaProducer.send({ topic: 'notification.send', messages });
    } catch (err) {
      this.logger.error(
        'Failed to send backup notification',
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Unknown error',
      );
    }
  }

  async findAll(filters: {
    status?: BackupStatus;
    startDate?: string;
    endDate?: string;
    page: number;
    limit: number;
  }): Promise<{ data: BackupLog[]; total: number }> {
    const qb = this.backupLogRepo.createQueryBuilder('b');
    if (filters.status) {
      qb.andWhere('b.status = :status', { status: filters.status });
    }
    if (filters.startDate) {
      qb.andWhere('b.startTime >= :startDate', {
        startDate: filters.startDate,
      });
    }
    if (filters.endDate) {
      qb.andWhere('b.startTime <= :endDate', { endDate: filters.endDate });
    }
    qb.orderBy('b.startTime', 'DESC')
      .skip((filters.page - 1) * filters.limit)
      .take(filters.limit);
    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findOne(backupId: string): Promise<BackupLog> {
    return this.backupLogRepo.findOneByOrFail({ backupId });
  }

  async getCollections(backupId: string): Promise<string[]> {
    const log = await this.findOne(backupId);
    const meta = log.metadata as { collections?: string[] } | null;
    return meta?.collections ?? [];
  }
}
