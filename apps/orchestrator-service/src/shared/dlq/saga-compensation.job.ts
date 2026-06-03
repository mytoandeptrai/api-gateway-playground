import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { SagaInstance, SagaStatus } from '@/modules/saga/entities/saga-instance.entity';
import { SagaStep, SagaStepStatus } from '@/modules/saga/entities/saga-step.entity';
import { KafkaProducer } from '@/shared/kafka/utils/kafka.producer';
import { CircuitBreakerService } from '@/shared/circuit-breaker/circuit-breaker.service';

// Steps that indicate stock is being held
const STEP_NEEDS_STOCK_RELEASE = new Set(['AWAIT_PAYMENT', 'CONFIRM_INVENTORY', 'CREATE_SHIPPING', 'AWAIT_DELIVERY']);
// Steps that indicate payment was already received
const STEP_NEEDS_REFUND = new Set(['CONFIRM_INVENTORY', 'CREATE_SHIPPING', 'AWAIT_DELIVERY']);

@Injectable()
export class SagaCompensationJob {
  private readonly logger = new Logger(SagaCompensationJob.name);

  constructor(
    @InjectRepository(SagaInstance)
    private readonly sagaRepo: Repository<SagaInstance>,
    @InjectRepository(SagaStep)
    private readonly stepRepo: Repository<SagaStep>,
    private readonly kafkaProducer: KafkaProducer,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly configService: ConfigService,
  ) {}

  @Cron('*/2 * * * *')
  async compensateFailedSagas() {
    const failed = await this.sagaRepo.find({
      where: { sagaType: 'ORDER_SAGA', status: SagaStatus.FAILED },
    });

    if (failed.length === 0) return;

    this.logger.log(`[COMPENSATION] Found ${failed.length} FAILED sagas to compensate`);

    for (const saga of failed) {
      try {
        await this.compensate(saga);
      } catch (err) {
        this.logger.error(`[COMPENSATION] Failed to compensate saga ${saga.id}: ${err}`);
      }
    }
  }

  private async compensate(saga: SagaInstance) {
    const completedSteps = await this.stepRepo.find({
      where: { sagaId: saga.id, status: SagaStepStatus.COMPLETED },
    });
    const completed = new Set(completedSteps.map((s) => s.stepName));

    const needsStockRelease = [...STEP_NEEDS_STOCK_RELEASE].some((s) => completed.has(s));
    const needsRefund = [...STEP_NEEDS_REFUND].some((s) => completed.has(s));

    this.logger.log(
      `[COMPENSATION] saga=${saga.id} orderId=${saga.orderId} ` +
      `needsStockRelease=${needsStockRelease} needsRefund=${needsRefund}`,
    );

    // Mark as COMPENSATING so existing onStockReleased handler can finalize
    await this.sagaRepo.update(saga.id, {
      status: SagaStatus.COMPENSATING,
      cancelReason: 'Lỗi hệ thống - tự động bù trừ',
    });

    if (needsRefund) {
      await this.emit('payment.refund_requested', saga, {
        orderId: saga.orderId,
        amount: saga.orderPayload?.totalAmount ?? 0,
        reason: 'Hoàn tiền do lỗi hệ thống',
      });
    }

    if (needsStockRelease) {
      // Emit release_stock — existing onStockReleased will cancel order + notify user
      await this.emit('inventory.release_stock', saga, {
        sagaId: saga.id,
        orderId: saga.orderId,
      });
    } else {
      // Stock was never reserved — cancel order + notify directly
      await this.cancelOrder(saga.orderId, 'Lỗi hệ thống');
      await this.notify(saga, 'Lỗi hệ thống, đơn hàng đã được hủy');
      await this.sagaRepo.update(saga.id, {
        status: SagaStatus.COMPENSATED,
        currentStep: 'CANCELLED',
      });
      this.logger.log(`[COMPENSATION] saga=${saga.id} COMPENSATED (no stock held)`);
    }
  }

  private async emit(topic: string, saga: SagaInstance, payload: Record<string, unknown>) {
    await this.kafkaProducer.send({
      topic,
      messages: [
        {
          key: saga.orderId,
          value: JSON.stringify({
            eventId: randomUUID(),
            eventType: topic,
            sagaId: saga.id,
            orderId: saga.orderId,
            userId: saga.userId,
            correlationId: randomUUID(),
            timestamp: new Date().toISOString(),
            payload,
          }),
        },
      ],
    });
  }

  private async cancelOrder(orderId: string, reason: string) {
    const url = this.configService.get<string>('ORDER_SERVICE_URL', 'http://localhost:3006');
    try {
      await this.circuitBreaker.patch(
        `${url}/api/v1/orders/${orderId}/status`,
        { status: 'CANCELLED', reason },
      );
    } catch (err) {
      this.logger.error(`[COMPENSATION] Failed to cancel order ${orderId}: ${err}`);
    }
  }

  private async notify(saga: SagaInstance, reason: string) {
    if (!saga.userEmail) return;
    await this.emit('notification.send', saga, {
      userId: saga.userId,
      email: saga.userEmail,
      template: 'order-cancelled',
      data: { orderId: saga.orderId, reason },
      channels: ['email', 'socket'],
    });
  }
}
