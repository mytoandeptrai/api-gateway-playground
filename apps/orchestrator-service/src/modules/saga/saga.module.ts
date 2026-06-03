import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { ScheduleModule } from '@nestjs/schedule';
import { SagaInstance } from './entities/saga-instance.entity';
import { SagaStep } from './entities/saga-step.entity';
import { OrderSagaService } from './order-saga.service';
import { SagaConsumerService } from './saga-consumer.service';
import { CircuitBreakerService } from '@/shared/circuit-breaker/circuit-breaker.service';
import { DlqService } from '@/shared/dlq/dlq.service';
import { SagaCompensationJob } from '@/shared/dlq/saga-compensation.job';

@Module({
  imports: [TypeOrmModule.forFeature([SagaInstance, SagaStep]), HttpModule, ScheduleModule.forRoot()],
  providers: [OrderSagaService, SagaConsumerService, CircuitBreakerService, DlqService, SagaCompensationJob],
})
export class SagaModule {}
