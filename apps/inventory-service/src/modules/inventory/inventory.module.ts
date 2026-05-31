import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryItem } from './entities/inventory-item.entity';
import { StockReservation } from './entities/stock-reservation.entity';
import { ProcessedEvent } from './entities/processed-event.entity';
import { InventoryService } from './inventory.service';
import { InventoryConsumerService } from './inventory-consumer.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([InventoryItem, StockReservation, ProcessedEvent]),
  ],
  providers: [InventoryService, InventoryConsumerService],
})
export class InventoryModule {}
