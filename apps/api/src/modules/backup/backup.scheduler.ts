import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BackupService } from './services/backup.service';
import { BACKUP_JOB, BACKUP_QUEUE } from './backup.constants';

@Injectable()
export class BackupScheduler {
  private readonly logger = new Logger(BackupScheduler.name);

  constructor(
    private readonly backupService: BackupService,
    @InjectQueue(BACKUP_QUEUE) private readonly backupQueue: Queue,
  ) {}

  @Cron('0 2 * * 0', { timeZone: 'Asia/Ho_Chi_Minh' })
  async runWeeklyBackup(): Promise<void> {
    this.logger.log('Triggering scheduled weekly backup');
    const log = await this.backupService.createBackupLog(true);
    await this.backupQueue.add(BACKUP_JOB, { backupId: log.backupId });
  }
}
