import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OutboxEvent } from '../entities/outbox-event.entity';
import { KafkaProducer } from '@/shared/kafka/utils/kafka.producer';

@Injectable()
export class OutboxWorker {
  private readonly logger = new Logger(OutboxWorker.name);

  constructor(
    @InjectRepository(OutboxEvent)
    private readonly outboxRepo: Repository<OutboxEvent>,
    private readonly kafkaProducer: KafkaProducer,
  ) {}

  @Cron('*/5 * * * * *')
  async publishOutboxEvents() {
    const events = await this.outboxRepo.find({
      where: { published: false },
      order: { createdAt: 'ASC' },
      take: 100,
    });

    if (events.length === 0) return;

    for (const event of events) {
      try {
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
      } catch (error) {
        this.logger.error(`Failed to publish outbox event ${event.id}: ${error}`);
      }
    }
  }
}
