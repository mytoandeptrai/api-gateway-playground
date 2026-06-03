import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { VnpayModule } from 'nestjs-vnpay';
import { ignoreLogger } from 'vnpay';
import { PaymentIntent } from './entities/payment-intent.entity';
import { OutboxEvent } from './entities/outbox-event.entity';
import { ProcessedWebhook } from './entities/processed-webhook.entity';
import { PaymentService } from './payment.service';
import { PaymentScheduleService } from './payment-schedule.service';
import { PaymentController } from './payment.controller';
import { PaymentConsumerService } from './payment-consumer.service';
import { OutboxWorker } from './outbox/outbox.worker';

@Module({
  imports: [
    TypeOrmModule.forFeature([PaymentIntent, OutboxEvent, ProcessedWebhook]),
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
  ],
  controllers: [PaymentController],
})
export class PaymentModule {}
