import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaymentIntent } from './entities/payment-intent.entity';
import { OutboxEvent } from './entities/outbox-event.entity';
import { ProcessedWebhook } from './entities/processed-webhook.entity';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { OutboxWorker } from './outbox/outbox.worker';

@Module({
  imports: [TypeOrmModule.forFeature([PaymentIntent, OutboxEvent, ProcessedWebhook])],
  providers: [PaymentService, OutboxWorker],
  controllers: [PaymentController],
})
export class PaymentModule {}
