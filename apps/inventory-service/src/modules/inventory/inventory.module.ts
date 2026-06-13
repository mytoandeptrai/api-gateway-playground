import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { InventoryItem } from './entities/inventory-item.entity';
import { StockReservation } from './entities/stock-reservation.entity';
import { ProcessedEvent } from './entities/processed-event.entity';
import { OutboxEvent } from './entities/outbox-event.entity';
import { InventoryService } from './inventory.service';
import { OutboxWorker } from './outbox/outbox.worker';
import { ReserveStockHandler } from './kafka/handlers/reserve-stock.handler';
import { ConfirmStockHandler } from './kafka/handlers/confirm-stock.handler';
import { ReleaseStockHandler } from './kafka/handlers/release-stock.handler';
import { InventoryConsumerService } from './kafka/inventory-consumer.service';
import { INVENTORY_TOPIC_HANDLERS } from './kafka/inventory-kafka.constants';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    TypeOrmModule.forFeature([
      InventoryItem,
      StockReservation,
      ProcessedEvent,
      OutboxEvent,
    ]),
  ],
  providers: [
    InventoryService,
    OutboxWorker,
    ReserveStockHandler,
    ConfirmStockHandler,
    ReleaseStockHandler,
    {
      provide: INVENTORY_TOPIC_HANDLERS,
      useFactory: (
        reserve: ReserveStockHandler,
        confirm: ConfirmStockHandler,
        release: ReleaseStockHandler,
      ) => [reserve, confirm, release],
      inject: [ReserveStockHandler, ConfirmStockHandler, ReleaseStockHandler],
    },
    InventoryConsumerService,
  ],
})
export class InventoryModule {}
