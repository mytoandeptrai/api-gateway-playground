import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShipmentRecord } from './entities/shipment-record.entity';
import { ShippingService } from './shipping.service';
import { ShippingConsumerService } from './shipping-consumer.service';

@Module({
  imports: [TypeOrmModule.forFeature([ShipmentRecord])],
  providers: [ShippingService, ShippingConsumerService],
})
export class ShippingModule {}
