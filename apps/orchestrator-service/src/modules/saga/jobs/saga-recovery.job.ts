import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SagaRecoveryService } from '@/modules/saga/saga-recovery.service';

@Injectable()
export class SagaRecoveryJob {
  constructor(private readonly sagaRecoveryService: SagaRecoveryService) {}

  @Cron('* * * * *')
  async run() {
    await this.sagaRecoveryService.recoverStuckSagas();
  }
}
