import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BackupLog, BackupStatus } from '../entities/backup-log.entity';
import { GoogleDriveService } from './google-drive.service';

@Injectable()
export class RetentionService {
  private readonly logger = new Logger(RetentionService.name);
  private readonly maxBackups: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly googleDriveService: GoogleDriveService,
    @InjectRepository(BackupLog)
    private readonly backupLogRepo: Repository<BackupLog>,
  ) {
    this.maxBackups = this.configService.get<number>('backup.maxBackups', 4);
  }

  async enforceRetention(): Promise<void> {
    const successfulBackups = await this.backupLogRepo.find({
      where: { status: BackupStatus.SUCCESS },
      order: { startTime: 'ASC' },
    });

    if (successfulBackups.length <= this.maxBackups) {
      return;
    }

    const toDelete = successfulBackups.slice(
      0,
      successfulBackups.length - this.maxBackups,
    );
    for (const backup of toDelete) {
      try {
        if (backup.fileId) {
          await this.googleDriveService.delete(backup.fileId);
        }
        await this.backupLogRepo.remove(backup);
        this.logger.log(`Retention: removed backup ${backup.backupId}`);
      } catch (err) {
        this.logger.error(
          `Retention: failed to remove backup ${backup.backupId}`,
          err instanceof Error
            ? err.message
            : typeof err === 'string'
              ? err
              : 'Unknown error',
        );
      }
    }
  }
}
