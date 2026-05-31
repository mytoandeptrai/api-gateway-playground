import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { ShipmentRecord, ShipmentStatus } from './entities/shipment-record.entity';
import { KafkaProducer } from '@/shared/kafka/utils/kafka.producer';

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
export class ShippingService {
  private readonly logger = new Logger(ShippingService.name);

  constructor(
    @InjectRepository(ShipmentRecord)
    private readonly shipmentRepo: Repository<ShipmentRecord>,
    private readonly kafkaProducer: KafkaProducer,
    private readonly configService: ConfigService,
  ) {}

  async createLabel(event: KafkaEnvelope) {
    const { sagaId, orderId, userId } = event;

    const existing = await this.shipmentRepo.findOne({ where: { orderId } });
    if (existing) {
      this.logger.warn(`Shipment already exists for order ${orderId}`);
      await this.publish('shipping.label_created', event, {
        orderId,
        sagaId,
        trackingId: existing.trackingId,
      });
      return;
    }

    const shipment = await this.shipmentRepo.save(
      this.shipmentRepo.create({
        orderId,
        sagaId,
        userId,
        status: ShipmentStatus.PREPARING,
      }),
    );

    await this.publish('shipping.label_created', event, {
      orderId,
      sagaId,
      trackingId: shipment.trackingId,
    });

    this.logger.log(`Shipping label created for order ${orderId}, trackingId=${shipment.trackingId}`);

    // Start mock delivery simulation
    this.simulateDelivery(shipment);
  }

  private async simulateDelivery(shipment: ShipmentRecord) {
    const intervalMs = this.configService.get<number>('MOCK_SHIPPING_INTERVAL_MS', 30000);
    const steps: ShipmentStatus[] = [
      ShipmentStatus.PICKED_UP,
      ShipmentStatus.IN_TRANSIT,
      ShipmentStatus.DELIVERED,
    ];

    for (const status of steps) {
      await this.delay(intervalMs);

      const updated = await this.shipmentRepo.findOne({ where: { id: shipment.id } });
      if (!updated || updated.status === ShipmentStatus.CANCELLED) break;

      await this.shipmentRepo.update(shipment.id, { status });

      if (status === ShipmentStatus.DELIVERED) {
        await this.publishStatusUpdate('shipping.delivered', shipment, status);
      } else {
        await this.publishStatusUpdate('shipping.status_updated', shipment, status);
      }

      this.logger.log(`Order ${shipment.orderId} shipping status: ${status}`);
    }
  }

  private async publishStatusUpdate(topic: string, shipment: ShipmentRecord, status: ShipmentStatus) {
    const envelope: KafkaEnvelope = {
      eventId: randomUUID(),
      eventType: topic,
      sagaId: shipment.sagaId,
      orderId: shipment.orderId,
      userId: shipment.userId,
      correlationId: randomUUID(),
      timestamp: new Date().toISOString(),
      payload: {
        orderId: shipment.orderId,
        trackingId: shipment.trackingId,
        status,
        sagaId: shipment.sagaId,
      },
    };

    await this.kafkaProducer.send({
      topic,
      messages: [{ key: shipment.orderId, value: JSON.stringify(envelope) }],
    });
  }

  private async publish(topic: string, sourceEvent: KafkaEnvelope, payload: object) {
    const envelope: KafkaEnvelope = {
      eventId: randomUUID(),
      eventType: topic,
      sagaId: sourceEvent.sagaId,
      orderId: sourceEvent.orderId,
      userId: sourceEvent.userId,
      correlationId: sourceEvent.correlationId,
      timestamp: new Date().toISOString(),
      payload: payload as Record<string, unknown>,
    };

    await this.kafkaProducer.send({
      topic,
      messages: [{ key: sourceEvent.orderId, value: JSON.stringify(envelope) }],
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
