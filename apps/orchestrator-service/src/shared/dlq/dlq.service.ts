import { Injectable, Logger } from '@nestjs/common';
import { setTimeout as sleep } from 'timers/promises';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KafkaProducer } from '@/shared/kafka/utils/kafka.producer';
import { SagaInstance, SagaStatus } from '@/modules/saga/entities/saga-instance.entity';

const RETRY_DELAYS_MS = [1_000, 3_000, 9_000]; // 1s → 3s → 9s
const MAX_RETRIES = 3;

@Injectable()
export class DlqService {
  private readonly logger = new Logger(DlqService.name);

  constructor(
    private readonly kafkaProducer: KafkaProducer,
    @InjectRepository(SagaInstance)
    private readonly sagaRepo: Repository<SagaInstance>,
  ) {}

  /**
   * Execute handler with retry (3 attempts, backoff 1s/3s/9s).
   * On exhaustion: publish to <topic>.dlq and mark saga FAILED.
   */
  async withRetry(
    topic: string,
    event: Record<string, unknown>,
    handler: () => Promise<void>,
  ): Promise<void> {
    let lastError: unknown;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await handler();
        return;
      } catch (err) {
        lastError = err;
        this.logger.warn(
          `[RETRY] ${topic} attempt ${attempt + 1}/${MAX_RETRIES} ` +
          `sagaId=${event.sagaId ?? '?'} orderId=${event.orderId ?? '?'}: ${err}`,
        );
        if (attempt < MAX_RETRIES - 1) {
          await sleep(RETRY_DELAYS_MS[attempt]);
        }
      }
    }

    // All retries exhausted
    await this.sendToDlq(topic, event, lastError);
    await this.markSagaFailed(event, String(lastError));
  }

  private async sendToDlq(
    topic: string,
    event: Record<string, unknown>,
    error: unknown,
  ) {
    const dlqTopic = `${topic}.dlq`;
    try {
      await this.kafkaProducer.send({
        topic: dlqTopic,
        messages: [
          {
            key: (event.orderId as string) ?? null,
            value: JSON.stringify({
              originalTopic: topic,
              event,
              error: String(error),
              failedAt: new Date().toISOString(),
            }),
          },
        ],
      });
      this.logger.error(
        `[DLQ] Message sent to ${dlqTopic} — sagaId=${event.sagaId ?? '?'} orderId=${event.orderId ?? '?'} error=${error}`,
      );
    } catch (dlqErr) {
      this.logger.error(`[DLQ] Failed to publish to ${dlqTopic}: ${dlqErr}`);
    }
  }

  private async markSagaFailed(
    event: Record<string, unknown>,
    reason: string,
  ) {
    const sagaId = event.sagaId as string | undefined;
    const orderId = event.orderId as string | undefined;

    if (!sagaId && !orderId) return;

    const where = sagaId ? { id: sagaId } : { orderId };
    const saga = await this.sagaRepo.findOne({ where: where as Parameters<typeof this.sagaRepo.findOne>[0]['where'] });
    if (!saga) return;

    await this.sagaRepo.update(saga.id, {
      status: SagaStatus.FAILED,
      currentStep: `FAILED:${event.eventType ?? 'unknown'}`,
    });

    this.logger.error(
      `[DLQ] SagaInstance ${saga.id} marked FAILED — reason: ${reason}`,
    );
  }
}
