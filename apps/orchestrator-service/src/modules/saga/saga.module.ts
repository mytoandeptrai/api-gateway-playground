import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { SagaInstance } from './entities/saga-instance.entity';
import { SagaStep } from './entities/saga-step.entity';
import { OrderSagaService } from './order-saga.service';
import { SagaConsumerService } from './saga-consumer.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([SagaInstance, SagaStep]),
    HttpModule,
  ],
  providers: [OrderSagaService, SagaConsumerService],
})
export class SagaModule {}
