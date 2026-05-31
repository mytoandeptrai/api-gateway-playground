import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { RedisService } from '@liaoliaots/nestjs-redis';
import type Redis from 'ioredis';
import Redlock from 'redlock';
import { randomUUID } from 'crypto';
import { InventoryItem } from './entities/inventory-item.entity';
import {
  StockReservation,
  ReservationStatus,
} from './entities/stock-reservation.entity';
import { ProcessedEvent } from './entities/processed-event.entity';
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
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);
  private readonly redlock: Redlock;

  constructor(
    @InjectRepository(InventoryItem)
    private readonly itemRepo: Repository<InventoryItem>,
    @InjectRepository(StockReservation)
    private readonly reservationRepo: Repository<StockReservation>,
    @InjectRepository(ProcessedEvent)
    private readonly processedEventRepo: Repository<ProcessedEvent>,
    private readonly dataSource: DataSource,
    private readonly kafkaProducer: KafkaProducer,
    private readonly redisService: RedisService,
  ) {
    const redisClient: Redis = this.redisService.getOrThrow();
    this.redlock = new Redlock([redisClient], {
      retryCount: 5,
      retryDelay: 200,
      retryJitter: 100,
    });
  }

  async reserveStock(event: KafkaEnvelope) {
    if (await this.isDuplicate(event.eventId)) return;

    const { productId, quantity, sagaId, orderId } = event.payload as {
      productId: string;
      quantity: number;
      sagaId: string;
      orderId: string;
    };

    const lockKey = `inventory:lock:${productId}`;
    const lock = await this.redlock.acquire([lockKey], 5000);

    try {
      const item = await this.itemRepo.findOne({ where: { productId } });

      if (!item || item.available < quantity) {
        await this.markProcessed(event.eventId);
        await this.publish('inventory.stock_insufficient', event, {
          productId,
          quantity,
          sagaId,
          orderId,
          reason: 'Insufficient stock',
        });
        this.logger.warn(
          `Insufficient stock for product ${productId}: available=${item?.available ?? 0}, requested=${quantity}`,
        );
        return;
      }

      await this.dataSource.transaction(async (manager) => {
        await manager.update(
          InventoryItem,
          { productId },
          {
            available: item.available - quantity,
            reserved: item.reserved + quantity,
          },
        );

        await manager.save(
          StockReservation,
          manager.create(StockReservation, {
            productId,
            orderId,
            sagaId,
            quantity,
            status: ReservationStatus.HELD,
          }),
        );

        await manager.save(
          ProcessedEvent,
          manager.create(ProcessedEvent, { eventId: event.eventId }),
        );
      });

      await this.publish('inventory.stock_reserved', event, {
        productId,
        quantity,
        sagaId,
        orderId,
      });
      this.logger.log(
        `Stock reserved: ${quantity}x ${productId} for order ${orderId}`,
      );
    } finally {
      await lock.release();
    }
  }

  async confirmStock(event: KafkaEnvelope) {
    if (await this.isDuplicate(event.eventId)) return;

    const { sagaId, orderId } = event.payload as {
      sagaId: string;
      orderId: string;
    };

    await this.dataSource.transaction(async (manager) => {
      const reservation = await manager.findOne(StockReservation, {
        where: { sagaId, status: ReservationStatus.HELD },
      });

      if (!reservation) {
        this.logger.warn(`No held reservation for sagaId=${sagaId}`);
        return;
      }

      await manager.update(
        StockReservation,
        { id: reservation.id },
        {
          status: ReservationStatus.CONFIRMED,
        },
      );

      await manager.update(
        InventoryItem,
        { productId: reservation.productId },
        {
          reserved: () => `reserved - ${reservation.quantity}`,
          totalStock: () => `"totalStock" - ${reservation.quantity}`,
        },
      );

      await manager.save(
        ProcessedEvent,
        manager.create(ProcessedEvent, { eventId: event.eventId }),
      );
    });

    await this.publish('inventory.stock_confirmed', event, { sagaId, orderId });
    this.logger.log(`Stock confirmed for saga ${sagaId}`);
  }

  async releaseStock(event: KafkaEnvelope) {
    if (await this.isDuplicate(event.eventId)) return;

    const { sagaId, orderId } = event.payload as {
      sagaId: string;
      orderId: string;
    };

    await this.dataSource.transaction(async (manager) => {
      const reservation = await manager.findOne(StockReservation, {
        where: { sagaId, status: ReservationStatus.HELD },
      });

      if (!reservation) {
        this.logger.warn(`No held reservation to release for sagaId=${sagaId}`);
        return;
      }

      await manager.update(
        StockReservation,
        { id: reservation.id },
        {
          status: ReservationStatus.RELEASED,
        },
      );

      await manager.update(
        InventoryItem,
        { productId: reservation.productId },
        {
          available: () => `available + ${reservation.quantity}`,
          reserved: () => `reserved - ${reservation.quantity}`,
        },
      );

      await manager.save(
        ProcessedEvent,
        manager.create(ProcessedEvent, { eventId: event.eventId }),
      );
    });

    await this.publish('inventory.stock_released', event, { sagaId, orderId });
    this.logger.log(`Stock released for saga ${sagaId}`);
  }

  private async isDuplicate(eventId: string): Promise<boolean> {
    const existing = await this.processedEventRepo.findOne({
      where: { eventId },
    });
    if (existing) {
      this.logger.warn(`Duplicate event detected: ${eventId}`);
      return true;
    }
    return false;
  }

  private async markProcessed(eventId: string) {
    await this.processedEventRepo.save(
      this.processedEventRepo.create({ eventId }),
    );
  }

  private async publish(
    topic: string,
    sourceEvent: KafkaEnvelope,
    payload: object,
  ) {
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
}
