import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { randomUUID, createHmac } from 'crypto';
import { VnpayService } from 'nestjs-vnpay';
import { ProductCode } from 'vnpay';
import { PaymentIntent, PaymentStatus } from './entities/payment-intent.entity';
import { OutboxEvent } from './entities/outbox-event.entity';
import { ProcessedWebhook } from './entities/processed-webhook.entity';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    @InjectRepository(PaymentIntent)
    private readonly intentRepo: Repository<PaymentIntent>,
    @InjectRepository(OutboxEvent)
    private readonly outboxRepo: Repository<OutboxEvent>,
    @InjectRepository(ProcessedWebhook)
    private readonly webhookRepo: Repository<ProcessedWebhook>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly vnpayService: VnpayService,
  ) {}

  async createQR(body: { orderId: string; amount: number; sagaId: string }) {
    const existing = await this.intentRepo.findOne({
      where: { orderId: body.orderId },
    });
    if (existing) {
      return {
        qrUrl: existing.qrUrl,
        paymentIntentId: existing.id,
        expiresAt: existing.paymentDeadline,
      };
    }

    const returnUrl = this.configService.getOrThrow<string>('vnpay.returnUrl');
    const timeoutMinutes = this.configService.get<number>('vnpay.timeoutMinutes', 15);

    const now = new Date();
    const expiresAt = new Date(now.getTime() + timeoutMinutes * 60 * 1000);

    const qrUrl = this.vnpayService.buildPaymentUrl({
      vnp_Amount: body.amount,
      vnp_IpAddr: '127.0.0.1',
      vnp_TxnRef: body.orderId,
      vnp_OrderInfo: `Thanh toan don hang ${body.orderId}`,
      vnp_OrderType: ProductCode.Other,
      vnp_ReturnUrl: returnUrl,
    });

    const intent = await this.intentRepo.save(
      this.intentRepo.create({
        orderId: body.orderId,
        idempotencyKey: body.orderId,
        amount: body.amount,
        vnpTxnRef: body.orderId,
        sagaId: body.sagaId,
        userId: '',
        status: PaymentStatus.PENDING,
        qrUrl,
        paymentDeadline: expiresAt,
      }),
    );

    this.logger.log(`Payment QR created for order ${body.orderId}`);
    return { qrUrl, paymentIntentId: intent.id, expiresAt };
  }

  async handleIPN(
    query: Record<string, string>,
  ): Promise<{ RspCode: string; Message: string }> {
    const hashSecret = this.configService.getOrThrow<string>('vnpay.hashSecret');
    const secureHash = query['vnp_SecureHash'];
    const txnRef = query['vnp_TxnRef'];
    const responseCode = query['vnp_ResponseCode'];

    const params = { ...query };
    delete params['vnp_SecureHash'];
    delete params['vnp_SecureHashType'];

    const sortedKeys = Object.keys(params).sort();
    const signData = sortedKeys
      .map((k) => `${k}=${encodeURIComponent(params[k]).replace(/%20/g, '+')}`)
      .join('&');
    const expectedHash = createHmac('sha512', hashSecret)
      .update(signData)
      .digest('hex');

    if (expectedHash !== secureHash) {
      this.logger.warn(`Invalid IPN signature for txnRef=${txnRef}`);
      return { RspCode: '97', Message: 'Invalid signature' };
    }

    const alreadyProcessed = await this.webhookRepo.findOne({
      where: { vnpTxnRef: txnRef },
    });
    if (alreadyProcessed) {
      return { RspCode: '00', Message: 'Already processed' };
    }

    const intent = await this.intentRepo.findOne({
      where: { orderId: txnRef },
    });
    if (!intent) {
      return { RspCode: '01', Message: 'Order not found' };
    }

    if (responseCode !== '00') {
      await this.intentRepo.update(intent.id, { status: PaymentStatus.FAILED });
      await this.webhookRepo.save(
        this.webhookRepo.create({ vnpTxnRef: txnRef }),
      );
      return { RspCode: '00', Message: 'Acknowledged' };
    }

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        PaymentIntent,
        { id: intent.id },
        {
          status: PaymentStatus.COMPLETED,
          paidAt: new Date(),
        },
      );

      const outbox = manager.create(OutboxEvent, {
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
            // productId and quantity come from orchestrator context
          },
        },
        published: false,
      });
      await manager.save(outbox);
      await manager.save(
        ProcessedWebhook,
        manager.create(ProcessedWebhook, { vnpTxnRef: txnRef }),
      );
    });

    this.logger.log(`Payment completed for order ${txnRef}`);
    return { RspCode: '00', Message: 'Success' };
  }

  async testPaymentUrl() {
    const returnUrl = this.configService.getOrThrow<string>('vnpay.returnUrl');
    const now = new Date();
    const orderId = `TEST${formatVnpDate(now).slice(-6)}`;
    const amount = 100000;
    
    const paymentUrl = this.vnpayService.buildPaymentUrl({
      vnp_Amount: amount,
      vnp_IpAddr: '127.0.0.1',
      vnp_TxnRef: orderId,
      vnp_OrderInfo: `Test order ${orderId}`,
      vnp_OrderType: ProductCode.Other,
      vnp_ReturnUrl: returnUrl,
    });

    return { orderId, amount, paymentUrl };
  }

  async getStatus(orderId: string) {
    const intent = await this.intentRepo.findOne({ where: { orderId } });
    if (!intent) {
      // Saga hasn't created the PaymentIntent yet — FE should keep polling
      return { status: 'PENDING', qrUrl: null, expiresAt: null };
    }
    return {
      status: intent.status,
      qrUrl: intent.qrUrl,
      expiresAt: intent.paymentDeadline,
    };
  }

  async processRefund(body: {
    orderId: string;
    amount: number;
    reason: string;
  }) {
    const intent = await this.intentRepo.findOne({
      where: { orderId: body.orderId },
    });
    if (!intent) throw new BadRequestException('Payment not found');

    await this.dataSource.transaction(async (manager) => {
      await manager.update(
        PaymentIntent,
        { id: intent.id },
        {
          status: PaymentStatus.REFUNDED,
          refundedAt: new Date(),
        },
      );

      const outbox = manager.create(OutboxEvent, {
        aggregateId: intent.id,
        eventType: 'payment.refunded',
        payload: {
          eventId: randomUUID(),
          eventType: 'payment.refunded',
          sagaId: intent.sagaId,
          orderId: intent.orderId,
          userId: intent.userId,
          correlationId: randomUUID(),
          timestamp: new Date().toISOString(),
          payload: { orderId: intent.orderId, amount: intent.amount },
        },
        published: false,
      });
      await manager.save(outbox);
    });

    this.logger.log(`Refund processed for order ${body.orderId}`);
    return { success: true };
  }

  async handleExpiredPayments(): Promise<number> {
    const expired = await this.intentRepo.find({
      where: {
        status: PaymentStatus.PENDING,
        paymentDeadline: LessThan(new Date()),
      },
    });

    for (const intent of expired) {
      await this.dataSource.transaction(async (manager) => {
        await manager.update(
          PaymentIntent,
          { id: intent.id },
          { status: PaymentStatus.EXPIRED },
        );

        const outbox = manager.create(OutboxEvent, {
          aggregateId: intent.id,
          eventType: 'payment.timeout',
          payload: {
            eventId: randomUUID(),
            eventType: 'payment.timeout',
            sagaId: intent.sagaId,
            orderId: intent.orderId,
            userId: intent.userId,
            correlationId: randomUUID(),
            timestamp: new Date().toISOString(),
            payload: {
              orderId: intent.orderId,
              expiredAt: new Date().toISOString(),
            },
          },
          published: false,
        });
        await manager.save(outbox);
      });

      this.logger.log(`Payment timeout for order ${intent.orderId}`);
    }

    return expired.length;
  }
}

function formatVnpDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getFullYear()}` +
    `${pad(date.getMonth() + 1)}` +
    `${pad(date.getDate())}` +
    `${pad(date.getHours())}` +
    `${pad(date.getMinutes())}` +
    `${pad(date.getSeconds())}`
  );
}
