import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { randomUUID } from 'crypto';
import { SagaInstance, SagaStatus } from './entities/saga-instance.entity';
import { SagaStep, SagaStepStatus } from './entities/saga-step.entity';
import { KafkaProducer } from '@/shared/kafka/utils/kafka.producer';

const STEP = {
  RESERVE_INVENTORY: 'RESERVE_INVENTORY',
  AWAIT_PAYMENT: 'AWAIT_PAYMENT',
  CONFIRM_INVENTORY: 'CONFIRM_INVENTORY',
  CREATE_SHIPPING: 'CREATE_SHIPPING',
  AWAIT_DELIVERY: 'AWAIT_DELIVERY',
  COMPLETE_ORDER: 'COMPLETE_ORDER',
} as const;

interface KafkaEnvelope {
  eventId: string;
  eventType: string;
  sagaId: string;
  orderId: string;
  userId: string;
  correlationId: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class OrderSagaService {
  private readonly logger = new Logger(OrderSagaService.name);

  constructor(
    @InjectRepository(SagaInstance)
    private readonly sagaRepo: Repository<SagaInstance>,
    @InjectRepository(SagaStep)
    private readonly stepRepo: Repository<SagaStep>,
    private readonly kafkaProducer: KafkaProducer,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  // ─── Saga start ────────────────────────────────────────────────────────────

  async startSaga(event: KafkaEnvelope) {
    const { orderId, userId, payload } = event;
    const userEmail = (payload.userEmail as string) ?? '';

    const existing = await this.sagaRepo.findOne({
      where: { orderId, status: SagaStatus.RUNNING },
    });
    if (existing) {
      this.logger.warn(`Saga already running for order ${orderId}, skipping`);
      return;
    }

    const saga = await this.sagaRepo.save(
      this.sagaRepo.create({
        sagaType: 'ORDER_SAGA',
        orderId,
        userId,
        userEmail,
        status: SagaStatus.RUNNING,
        currentStep: STEP.RESERVE_INVENTORY,
        orderPayload: payload,
      }),
    );

    await this.createStep(
      saga.id,
      STEP.RESERVE_INVENTORY,
      'inventory.reserve_stock',
      payload,
    );
    await this.publishCommand(
      'inventory.reserve_stock',
      saga.id,
      orderId,
      userId,
      {
        productId: payload.productId,
        quantity: payload.quantity,
        sagaId: saga.id,
        orderId,
      },
    );

    this.logger.log(`Saga ${saga.id} started for order ${orderId}`);
  }

  // ─── Step 1: Inventory reserved ─────────────────────────────────────────

  async onInventoryReserved(event: KafkaEnvelope) {
    const saga = await this.findRunningSaga(event.orderId);
    if (!saga) return;

    await this.completeStep(saga.id, STEP.RESERVE_INVENTORY, event.payload);
    await this.createStep(saga.id, STEP.AWAIT_PAYMENT, null, null);
    await this.sagaRepo.update(saga.id, { currentStep: STEP.AWAIT_PAYMENT });

    // Create payment QR via HTTP call to payment-service
    await this.createPaymentQR(saga, saga.orderPayload);

    this.logger.log(`Saga ${saga.id}: inventory reserved, waiting for payment`);
  }

  async onInventoryInsufficient(event: KafkaEnvelope) {
    const saga = await this.findRunningSaga(event.orderId);
    if (!saga) return;

    await this.failStep(
      saga.id,
      STEP.RESERVE_INVENTORY,
      'Sản phẩm không đủ hàng',
    );
    await this.sagaRepo.update(saga.id, {
      status: SagaStatus.COMPENSATED,
      currentStep: 'CANCELLED',
    });

    await this.cancelOrder(saga.orderId, 'Sản phẩm hết hàng');
    await this.sendNotification(saga, 'order-cancelled', {
      reason: 'Sản phẩm hết hàng',
    });

    this.logger.log(`Saga ${saga.id}: inventory insufficient, order cancelled`);
  }

  // ─── Step 2: Payment ─────────────────────────────────────────────────────

  async onPaymentCompleted(event: KafkaEnvelope) {
    const saga = await this.findRunningSaga(event.orderId);
    if (!saga) return;

    await this.completeStep(saga.id, STEP.AWAIT_PAYMENT, event.payload);
    await this.createStep(
      saga.id,
      STEP.CONFIRM_INVENTORY,
      'inventory.confirm_stock',
      event.payload,
    );
    await this.sagaRepo.update(saga.id, {
      currentStep: STEP.CONFIRM_INVENTORY,
    });

    await this.updateOrderStatus(saga.orderId, 'PAYMENT_RECEIVED');
    await this.publishCommand(
      'inventory.confirm_stock',
      saga.id,
      saga.orderId,
      saga.userId,
      {
        productId: event.payload.productId,
        quantity: event.payload.quantity,
        sagaId: saga.id,
        orderId: saga.orderId,
      },
    );

    this.logger.log(`Saga ${saga.id}: payment completed, confirming inventory`);
  }

  async onPaymentTimeout(event: KafkaEnvelope) {
    const saga = await this.findRunningSaga(event.orderId);
    if (!saga) return;

    await this.failStep(
      saga.id,
      STEP.AWAIT_PAYMENT,
      'Hết thời gian thanh toán',
    );
    await this.sagaRepo.update(saga.id, { status: SagaStatus.COMPENSATING });

    // Compensation: release stock
    await this.publishCommand(
      'inventory.release_stock',
      saga.id,
      saga.orderId,
      saga.userId,
      {
        sagaId: saga.id,
        orderId: saga.orderId,
      },
    );

    this.logger.log(`Saga ${saga.id}: payment timeout, releasing stock`);
  }

  // ─── Step 3: Inventory confirmed ─────────────────────────────────────────

  async onInventoryConfirmed(event: KafkaEnvelope) {
    const saga = await this.findRunningSaga(event.orderId);
    if (!saga) return;

    await this.completeStep(saga.id, STEP.CONFIRM_INVENTORY, event.payload);
    await this.createStep(
      saga.id,
      STEP.CREATE_SHIPPING,
      'shipping.create_label',
      null,
    );
    await this.sagaRepo.update(saga.id, { currentStep: STEP.CREATE_SHIPPING });

    await this.updateOrderStatus(saga.orderId, 'CONFIRMED');
    await this.publishCommand(
      'shipping.create_label',
      saga.id,
      saga.orderId,
      saga.userId,
      {
        sagaId: saga.id,
        orderId: saga.orderId,
        userId: saga.userId,
      },
    );

    this.logger.log(
      `Saga ${saga.id}: inventory confirmed, creating shipping label`,
    );
  }

  // ─── Step 4: Shipping label created ──────────────────────────────────────

  async onShippingLabelCreated(event: KafkaEnvelope) {
    const saga = await this.findRunningSaga(event.orderId);
    if (!saga) return;

    const trackingId = event.payload.trackingId as string;
    await this.completeStep(saga.id, STEP.CREATE_SHIPPING, event.payload);
    await this.createStep(saga.id, STEP.AWAIT_DELIVERY, null, null);
    await this.sagaRepo.update(saga.id, { currentStep: STEP.AWAIT_DELIVERY });

    await this.updateOrderStatus(saga.orderId, 'PREPARING', { trackingId });
    await this.sendNotification(saga, 'order-confirmed', { trackingId });

    this.logger.log(
      `Saga ${saga.id}: shipping label created, trackingId=${trackingId}`,
    );
  }

  // ─── Step 5: Shipping delivered ───────────────────────────────────────────

  async onShippingDelivered(event: KafkaEnvelope) {
    const saga = await this.findRunningSaga(event.orderId);
    if (!saga) return;

    await this.completeStep(saga.id, STEP.AWAIT_DELIVERY, event.payload);
    await this.sagaRepo.update(saga.id, {
      status: SagaStatus.COMPLETED,
      currentStep: STEP.COMPLETE_ORDER,
    });

    await this.updateOrderStatus(saga.orderId, 'DELIVERED');
    await this.sendNotification(saga, 'order-delivered', {});

    this.logger.log(
      `Saga ${saga.id}: COMPLETED — order ${saga.orderId} delivered`,
    );
  }

  // ─── Compensation: stock released ─────────────────────────────────────────

  async onStockReleased(event: KafkaEnvelope) {
    const saga = await this.sagaRepo.findOne({
      where: { orderId: event.orderId, status: SagaStatus.COMPENSATING },
    });
    if (!saga) return;

    await this.sagaRepo.update(saga.id, {
      status: SagaStatus.COMPENSATED,
      currentStep: 'CANCELLED',
    });
    await this.cancelOrder(saga.orderId, 'Hết thời gian thanh toán');
    await this.sendNotification(saga, 'order-cancelled', {
      reason: 'Hết thời gian thanh toán',
    });

    this.logger.log(`Saga ${saga.id}: stock released, order cancelled`);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private async findRunningSaga(orderId: string): Promise<SagaInstance | null> {
    const saga = await this.sagaRepo.findOne({
      where: { orderId, status: SagaStatus.RUNNING },
    });
    if (!saga) {
      this.logger.warn(`No running saga found for order ${orderId}`);
    }
    return saga;
  }

  private async createStep(
    sagaId: string,
    stepName: string,
    commandTopic: string | null,
    payload: object | null,
  ) {
    return this.stepRepo.save(
      this.stepRepo.create({
        sagaId,
        stepName,
        commandTopic,
        payload,
        status: SagaStepStatus.IN_PROGRESS,
        startedAt: new Date(),
      }),
    );
  }

  private async completeStep(sagaId: string, stepName: string, result: object) {
    await this.stepRepo.update(
      { sagaId, stepName },
      { status: SagaStepStatus.COMPLETED, result, completedAt: new Date() },
    );
  }

  private async failStep(sagaId: string, stepName: string, reason: string) {
    await this.stepRepo.update(
      { sagaId, stepName },
      {
        status: SagaStepStatus.FAILED,
        failedReason: reason,
        completedAt: new Date(),
      },
    );
  }

  private async publishCommand(
    topic: string,
    sagaId: string,
    orderId: string,
    userId: string,
    payload: object,
  ) {
    const envelope: KafkaEnvelope = {
      eventId: randomUUID(),
      eventType: topic,
      sagaId,
      orderId,
      userId,
      correlationId: randomUUID(),
      timestamp: new Date().toISOString(),
      payload: payload as Record<string, unknown>,
    };

    await this.kafkaProducer.send({
      topic,
      messages: [{ key: orderId, value: JSON.stringify(envelope) }],
    });
  }

  private async createPaymentQR(
    saga: SagaInstance,
    orderPayload: Record<string, unknown>,
  ) {
    const paymentUrl = this.configService.get<string>(
      'PAYMENT_SERVICE_URL',
      'http://localhost:3008',
    );
    const apiPrefix = 'api/v1';

    try {
      await firstValueFrom(
        this.httpService.post(`${paymentUrl}/${apiPrefix}/payment/create-qr`, {
          orderId: saga.orderId,
          amount: orderPayload.totalAmount,
          sagaId: saga.id,
        }),
      );
    } catch (error) {
      this.logger.error(
        `Failed to create payment QR for order ${saga.orderId}: ${error}`,
      );
    }
  }

  private async updateOrderStatus(
    orderId: string,
    status: string,
    extra: Record<string, unknown> = {},
  ) {
    const orderUrl = this.configService.get<string>(
      'ORDER_SERVICE_URL',
      'http://localhost:3006',
    );
    const apiPrefix = 'api/v1';

    try {
      await firstValueFrom(
        this.httpService.patch(
          `${orderUrl}/${apiPrefix}/orders/${orderId}/status`,
          {
            status,
            ...extra,
          },
        ),
      );
    } catch (error) {
      this.logger.error(
        `Failed to update order ${orderId} status to ${status}: ${error}`,
      );
    }
  }

  private async cancelOrder(orderId: string, reason: string) {
    await this.updateOrderStatus(orderId, 'CANCELLED', { reason });
  }

  private async sendNotification(
    saga: SagaInstance,
    template: string,
    data: Record<string, unknown>,
  ) {
    await this.publishCommand(
      'notification.send',
      saga.id,
      saga.orderId,
      saga.userId,
      {
        userId: saga.userId,
        email: saga.userEmail,
        template,
        data: { orderId: saga.orderId, ...data },
        channels: ['email', 'socket'],
      },
    );
  }
}
