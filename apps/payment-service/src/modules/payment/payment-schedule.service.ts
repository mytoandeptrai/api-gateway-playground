import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PaymentService } from './payment.service';

@Injectable()
export class PaymentScheduleService {
  private readonly logger = new Logger(PaymentScheduleService.name);
  private isRunning = false;

  constructor(private readonly paymentService: PaymentService) {}

  @Cron('0 * * * * *')
  async checkPaymentTimeouts() {
    if (this.isRunning) {
      this.logger.warn('Payment timeout check is already running, skipping...');
      return;
    }

    this.isRunning = true;
    try {
      const processed = await this.paymentService.handleExpiredPayments();
      if (processed > 0) {
        this.logger.log(`Payment timeout check done, processed ${processed} intents`);
      }
    } finally {
      this.isRunning = false;
    }
  }
}
