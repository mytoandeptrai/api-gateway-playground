import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { SagaInstance, SagaStatus } from './entities/saga-instance.entity';
import { KafkaProducer } from '@/shared/kafka/utils/kafka.producer';

// Steps where orchestrator emits a Kafka command and waits for a reply.
// AWAIT_PAYMENT and AWAIT_DELIVERY are skipped: payment-service has its own
// 15-min timeout cron, and shipping-service drives delivery updates itself.
const RECOVERABLE_STEPS: Record<string, string> = {
  RESERVE_INVENTORY: 'inventory.reserve_stock',
  CONFIRM_INVENTORY: 'inventory.confirm_stock',
  CREATE_SHIPPING: 'shipping.create_label',
};

@Injectable()
export class SagaRecoveryService {
  private readonly logger = new Logger(SagaRecoveryService.name);

  constructor(
    @InjectRepository(SagaInstance)
    private readonly sagaRepo: Repository<SagaInstance>,
    private readonly kafkaProducer: KafkaProducer,
    private readonly configService: ConfigService,
  ) {}

  async recoverStuckSagas() {
    const timeoutMinutes = this.configService.get<number>(
      'SAGA_RECOVERY_TIMEOUT_MINUTES',
      10,
    );
    const cutoff = new Date(Date.now() - timeoutMinutes * 60 * 1000);

    const stuckSagas = await this.sagaRepo.find({
      where: {
        sagaType: 'ORDER_SAGA',
        status: SagaStatus.RUNNING,
        updatedAt: LessThan(cutoff),
      },
    });

    if (stuckSagas.length === 0) return;

    this.logger.warn(
      `[RECOVERY] ${stuckSagas.length} stuck saga(s) found (no activity > ${timeoutMinutes}m)`,
    );

    for (const saga of stuckSagas) {
      try {
        await this.recover(saga);
      } catch (err) {
        this.logger.error(
          `[RECOVERY] saga=${saga.id}: ${err instanceof Error ? err.message : typeof err === 'string' ? err : 'Unknown error'}`,
        );
      }
    }
  }

  private async recover(saga: SagaInstance) {
    const commandTopic = RECOVERABLE_STEPS[saga.currentStep];
    if (!commandTopic) {
      this.logger.log(
        `[RECOVERY] saga=${saga.id} step=${saga.currentStep} — not recoverable, skipping`,
      );
      return;
    }

    const payload = this.buildPayload(saga);
    this.logger.warn(
      `[RECOVERY] saga=${saga.id} orderId=${saga.orderId} stuck at ${saga.currentStep} — re-publishing ${commandTopic}`,
    );

    await this.kafkaProducer.send({
      topic: commandTopic,
      messages: [
        {
          key: saga.orderId,
          value: JSON.stringify({
            eventId: randomUUID(),
            eventType: commandTopic,
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

  private buildPayload(saga: SagaInstance): Record<string, unknown> {
    const { id: sagaId, orderId, userId, orderPayload } = saga;
    const base = { sagaId, orderId };

    switch (saga.currentStep) {
      case 'RESERVE_INVENTORY':
      case 'CONFIRM_INVENTORY':
        if (!orderPayload?.productId || !orderPayload?.quantity) {
          this.logger.error(
            `[RECOVERY] saga=${sagaId} missing productId/quantity in orderPayload — cannot recover, mark as FAILED manually`,
          );
          throw new Error(
            `saga=${sagaId} orderPayload missing productId/quantity`,
          );
        }
        return {
          ...base,
          productId: orderPayload.productId,
          quantity: orderPayload.quantity,
        };
      case 'CREATE_SHIPPING':
        return { ...base, userId };
      default:
        return base;
    }
  }
}
