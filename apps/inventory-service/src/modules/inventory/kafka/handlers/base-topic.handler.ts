import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageHandler } from '@/shared/kafka/types/kafka.type';

export interface KafkaMessagePayload {
  key: string | null;
  value: string | null;
  topic: string;
  partition: number;
}

export abstract class BaseTopicHandler<T> {
  protected readonly logger = new Logger(this.constructor.name);

  constructor(protected readonly configService: ConfigService) {}

  abstract getTopic(): string;

  abstract handle(event: T): Promise<void>;

  getGroupId(): string {
    return `inventory-group-${this.getTopic()}`;
  }

  getConsumerCount(): number {
    return this.configService.get<number>(
      `number_of_consumer_${this.getTopic()}`,
      1,
    );
  }

  getPartitionCount(): number {
    return this.configService.get<number>(`partitions_${this.getTopic()}`, 1);
  }

  asMessageHandler(): MessageHandler {
    return (message) => this.processMessage(message);
  }

  async processMessage(message: KafkaMessagePayload): Promise<void> {
    if (!message.value) return;

    const event = JSON.parse(message.value) as T;
    this.logger.log(
      `[KAFKA] Received ${this.getTopic()}: ${JSON.stringify(event).slice(0, 80)}`,
    );

    await this.handle(event);

    this.logger.log(`[KAFKA] ✓ Processed ${this.getTopic()}`);
  }
}
