import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Job } from 'bullmq';
import { randomUUID } from 'crypto';
import {
  PaymentIntent,
  PaymentStatus,
} from '../entities/payment-intent.entity';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { ProcessedWebhook } from '../entities/processed-webhook.entity';
import { IPN_QUEUE } from '../payment.constants';

export interface IpnJobData {
  query: Record<string, string>;
}

@Processor(IPN_QUEUE, { concurrency: 5 })
@Injectable()
export class IpnProcessor extends WorkerHost {
  private readonly logger = new Logger(IpnProcessor.name);

  constructor(
    @InjectRepository(PaymentIntent)
    private readonly intentRepo: Repository<PaymentIntent>,
    @InjectRepository(ProcessedWebhook)
    private readonly webhookRepo: Repository<ProcessedWebhook>,
    private readonly dataSource: DataSource,
  ) {
    super();
  }

  @OnWorkerEvent('ready')
  onReady() {
    this.logger.log('[IPN Worker] Connected to Redis — ready to process jobs');
  }

  @OnWorkerEvent('error')
  onError(err: Error) {
    this.logger.error(`[IPN Worker] Worker error: ${err.message}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<IpnJobData> | undefined, err: Error) {
    this.logger.error(
      `[IPN Worker] Job#${job?.id} exhausted all retries txnRef=${job?.data?.query?.['vnp_TxnRef']} — ${err.message}`,
    );
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string) {
    this.logger.warn(
      `[IPN Worker] Job#${jobId} stalled — worker may have crashed mid-process`,
    );
  }

  async process(job: Job<IpnJobData>): Promise<void> {
    const { query } = job.data;
    const txnRef = query['vnp_TxnRef'];
    const responseCode = query['vnp_ResponseCode'];

    this.logger.log(
      `[IPN] Processing job#${job.id} txnRef=${txnRef} responseCode=${responseCode} attempt=${job.attemptsMade + 1}`,
    );

    const alreadyProcessed = await this.webhookRepo.findOne({
      where: { vnpTxnRef: txnRef },
    });
    if (alreadyProcessed) {
      this.logger.log(`[IPN] Already processed txnRef=${txnRef}, skipping`);
      return;
    }

    const intent = await this.intentRepo.findOne({
      where: { orderId: txnRef },
    });
    if (!intent) {
      this.logger.warn(`[IPN] PaymentIntent not found for txnRef=${txnRef}`);
      return;
    }

    this.logger.log(
      `[IPN] Found intent id=${intent.id} currentStatus=${intent.status} sagaId=${intent.sagaId}`,
    );

    if (responseCode !== '00') {
      await this.processFailure(intent, txnRef, responseCode);
    } else {
      await this.processSuccess(intent, txnRef);
    }
  }

  private async processFailure(
    intent: PaymentIntent,
    txnRef: string,
    responseCode: string,
  ): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.update(
          PaymentIntent,
          { id: intent.id },
          { status: PaymentStatus.FAILED },
        );
        await manager.save(
          manager.create(OutboxEvent, {
            aggregateId: intent.id,
            eventType: 'payment.failed',
            payload: {
              eventId: randomUUID(),
              eventType: 'payment.failed',
              sagaId: intent.sagaId,
              orderId: intent.orderId,
              userId: intent.userId,
              correlationId: randomUUID(),
              timestamp: new Date().toISOString(),
              payload: {
                orderId: intent.orderId,
                reason: `VNPay response code: ${responseCode}`,
              },
            },
            published: false,
          }),
        );
        await manager.save(
          manager.create(ProcessedWebhook, { vnpTxnRef: txnRef }),
        );
      });
      this.logger.warn(
        `[IPN] Payment FAILED txnRef=${txnRef} code=${responseCode} → intent marked FAILED, outbox event queued`,
      );
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        this.logger.log(
          `[IPN] Duplicate webhook ignored (unique violation) txnRef=${txnRef}`,
        );
        return;
      }
      this.logger.error(
        `[IPN] processFailure error txnRef=${txnRef}`,
        err instanceof Error ? err.stack : JSON.stringify(err),
      );
      throw err;
    }
  }

  private async processSuccess(
    intent: PaymentIntent,
    txnRef: string,
  ): Promise<void> {
    try {
      await this.dataSource.transaction(async (manager) => {
        await manager.update(
          PaymentIntent,
          { id: intent.id },
          { status: PaymentStatus.COMPLETED, paidAt: new Date() },
        );
        await manager.save(
          manager.create(OutboxEvent, {
            aggregateId: intent.id,
            eventType: 'payment.completed',
            payload: {
              eventId: randomUUID(),
              eventType: 'payment.completed',
              sagaId: intent.sagaId,
              orderId: intent.orderId,
              userId: intent.userId,
              correlationId: randomUUID(),
              timestamp: new Date().toISOString(),
              payload: {
                orderId: intent.orderId,
                amount: intent.amount,
                vnpTxnRef: txnRef,
                paidAt: new Date().toISOString(),
              },
            },
            published: false,
          }),
        );
        await manager.save(
          manager.create(ProcessedWebhook, { vnpTxnRef: txnRef }),
        );
      });
      this.logger.log(
        `[IPN] Payment COMPLETED txnRef=${txnRef} → intent marked COMPLETED, outbox event queued`,
      );
    } catch (err) {
      if (this.isUniqueViolation(err)) {
        this.logger.log(
          `[IPN] Duplicate webhook ignored (unique violation) txnRef=${txnRef}`,
        );
        return;
      }
      this.logger.error(
        `[IPN] processSuccess error txnRef=${txnRef}`,
        err instanceof Error ? err.stack : JSON.stringify(err),
      );
      throw err;
    }
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: string }).code === '23505'
    );
  }
}
