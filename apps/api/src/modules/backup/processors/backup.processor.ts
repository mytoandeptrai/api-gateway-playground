import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { BackupService } from '../services/backup.service';
import { RedlockService } from '../services/redlock.service';
import { BACKUP_QUEUE } from '../backup.constants';

export interface BackupJobData {
  backupId: string;
}

@Processor(BACKUP_QUEUE)
export class BackupProcessor extends WorkerHost {
  private readonly logger = new Logger(BackupProcessor.name);

  constructor(
    private readonly backupService: BackupService,
    private readonly redlockService: RedlockService,
  ) {
    super();
  }

  async process(job: Job<BackupJobData>): Promise<void> {
    const { backupId } = job.data;
    this.logger.log(`[${backupId}] Job received`);

    this.logger.log(`[${backupId}] Acquiring distributed lock...`);
    const lock = await this.redlockService.acquireBackupLock();
    this.logger.log(`[${backupId}] Lock acquired`);

    try {
      await this.backupService.executeBackup(backupId);
      this.logger.log(`[${backupId}] Job completed successfully`);
    } catch (err) {
      this.logger.error(
        `[${backupId}] Job failed`,
        err instanceof Error ? err.stack : JSON.stringify(err),
      );
      throw err;
    } finally {
      await this.redlockService.releaseLock(lock);
      this.logger.log(`[${backupId}] Lock released`);
    }
  }
}
