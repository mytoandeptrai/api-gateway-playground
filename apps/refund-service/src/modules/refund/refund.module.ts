import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { RefundRequest } from './entities/refund-request.entity';
import { OutboxEvent } from './entities/outbox-event.entity';
import { RefundService } from './refund.service';
import { RefundController } from './refund.controller';
import { RefundConsumerService } from './refund-consumer.service';
import { OutboxWorker } from './outbox/outbox.worker';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([RefundRequest, OutboxEvent]),
  ],
  controllers: [RefundController],
  providers: [RefundService, RefundConsumerService, OutboxWorker],
})
export class RefundModule {}
