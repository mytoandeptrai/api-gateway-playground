import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { SagaInstance } from './entities/saga-instance.entity';
import { SagaStep } from './entities/saga-step.entity';
import { OrderSagaService } from './order-saga.service';
import { SagaConsumerService } from './saga-consumer.service';
import { CircuitBreakerService } from '@/shared/circuit-breaker/circuit-breaker.service';
import { DlqService } from '@/shared/dlq/dlq.service';

@Module({
  imports: [TypeOrmModule.forFeature([SagaInstance, SagaStep]), HttpModule],
  providers: [OrderSagaService, SagaConsumerService, CircuitBreakerService, DlqService],
})
export class SagaModule {}
