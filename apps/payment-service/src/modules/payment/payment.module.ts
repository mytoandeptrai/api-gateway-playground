import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { VnpayModule } from 'nestjs-vnpay';
import { ignoreLogger } from 'vnpay';
import { PaymentIntent } from './entities/payment-intent.entity';
import { OutboxEvent } from './entities/outbox-event.entity';
import { ProcessedWebhook } from './entities/processed-webhook.entity';
import { PaymentService } from './services/payment.service';
import { PaymentScheduleService } from './services/payment-schedule.service';
import { PaymentController } from './payment.controller';
import { PaymentConsumerService } from './services/payment-consumer.service';
import { OutboxWorker } from './outbox/outbox.worker';
import { IpnProcessor } from './processors/ipn.processor';
import { IPN_QUEUE } from './payment.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentIntent, OutboxEvent, ProcessedWebhook]),
    BullModule.registerQueue({
      name: IPN_QUEUE,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        // Keep last N jobs in Redis to avoid memory bloat
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    }),
    VnpayModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        tmnCode: configService.getOrThrow<string>('vnpay.tmnCode'),
        secureSecret: configService.getOrThrow<string>('vnpay.hashSecret'),
        vnpayHost: 'https://sandbox.vnpayment.vn',
        testMode: true,
        loggerFn: ignoreLogger,
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [
    PaymentService,
    PaymentScheduleService,
    PaymentConsumerService,
    OutboxWorker,
    IpnProcessor,
  ],
  controllers: [PaymentController],
})
export class PaymentModule {}
