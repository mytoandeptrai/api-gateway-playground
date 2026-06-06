import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { RestoreService } from '../services/restore.service';
import { RedlockService } from '../services/redlock.service';
import { RESTORE_QUEUE } from '../backup.constants';

export interface RestoreJobData {
  restoreId: string;
}

@Processor(RESTORE_QUEUE)
export class RestoreProcessor extends WorkerHost {
  private readonly logger = new Logger(RestoreProcessor.name);

  constructor(
    private readonly restoreService: RestoreService,
    private readonly redlockService: RedlockService,
  ) {
    super();
  }

  async process(job: Job<RestoreJobData>): Promise<void> {
    const { restoreId } = job.data;
    this.logger.log(`Processing restore job: ${restoreId}`);

    const lock = await this.redlockService.acquireBackupLock();
    try {
      await this.restoreService.executeRestore(restoreId);
      this.logger.log(`Restore completed: ${restoreId}`);
    } finally {
      await this.redlockService.releaseLock(lock);
    }
  }
}
