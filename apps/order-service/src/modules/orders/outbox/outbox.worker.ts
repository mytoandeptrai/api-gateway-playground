import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { KafkaProducer } from '@/shared/kafka/utils/kafka.producer';

@Injectable()
export class OutboxWorker {
  private readonly logger = new Logger(OutboxWorker.name);
  private isRunning = false;

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepo: Repository<OutboxEvent>,
    private readonly kafkaProducer: KafkaProducer,
  ) {}

  @Cron('*/5 * * * * *')
  async publishOutboxEvents() {
    if (this.isRunning) {
      this.logger.warn('Outbox worker is already running, skipping...');
      return;
    }

    this.isRunning = true;
    try {
      const events = await this.outboxRepo.find({
        where: { published: false },
        order: { createdAt: 'ASC' },
        take: 100,
      });

      if (events.length === 0) return;

      this.logger.log(
        `Outbox worker started, publishing ${events.length} events`,
      );
      let published = 0;
      for (const event of events) {
        try {
          this.logger.log(
            `[KAFKA] Publishing ${event.eventType}: ${event.aggregateId}`,
          );
          await this.kafkaProducer.send({
            topic: event.eventType,
            messages: [
              {
                key: event.aggregateId,
                value: JSON.stringify(event.payload),
              },
            ],
          });
          await this.outboxRepo.update(event.id, { published: true });
          this.logger.log(`[KAFKA] ✓ Published ${event.eventType}`);
          published++;
        } catch (error) {
          this.logger.error(
            `[KAFKA] ✗ Failed to publish ${event.eventType}`,
            error instanceof Error ? error.stack : JSON.stringify(error),
          );
        }
      }
      this.logger.log(
        `Outbox worker done, published ${published}/${events.length} events`,
      );
    } finally {
      this.isRunning = false;
    }
  }
}
