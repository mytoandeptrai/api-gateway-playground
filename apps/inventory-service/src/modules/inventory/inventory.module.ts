import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { InventoryItem } from './entities/inventory-item.entity';
import { StockReservation } from './entities/stock-reservation.entity';
import { ProcessedEvent } from './entities/processed-event.entity';
import { OutboxEvent } from './entities/outbox-event.entity';
import { InventoryService } from './inventory.service';
import { InventoryConsumerService } from './inventory-consumer.service';
import { OutboxWorker } from './outbox/outbox.worker';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([InventoryItem, StockReservation, ProcessedEvent, OutboxEvent]),
  ],
  providers: [InventoryService, InventoryConsumerService, OutboxWorker],
})
export class InventoryModule {}
