import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Producer, ProducerRecord } from 'kafkajs';
import { setTimeout as sleep } from 'timers/promises';
import { IKafkaProducer } from '../types/kafka.type';
import { KafkaConfigService } from './kafka.config';

@Injectable()
export class KafkaProducer
  implements IKafkaProducer, OnModuleInit, OnModuleDestroy
{
  private readonly producer: Producer;
  private readonly logger = new Logger(KafkaProducer.name);

  constructor(kafkaConfigService: KafkaConfigService) {
    this.producer = kafkaConfigService.getKafkaInstance().producer();
  }

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  async connect(retries = 3): Promise<void> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.producer.connect();
        this.logger.log('[KafkaProducer] Connected to Kafka broker(s)');
        return;
      } catch (error) {
        this.logger.error(
          `[KafkaProducer] Connect attempt ${attempt}/${retries} failed`,
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : 'Unknown error',
        );
        if (attempt >= retries) throw error;
        await sleep(1000 * attempt);
      }
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.producer.disconnect();
      this.logger.log('[KafkaProducer] Disconnected from Kafka broker(s)');
    } catch (error) {
      this.logger.error(
        '[KafkaProducer] Disconnect failed',
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'Unknown error',
      );
      throw error;
    }
  }

  async send(message: ProducerRecord): Promise<void> {
    try {
      await this.producer.send(message);
    } catch (error) {
      this.logger.error(
        '[KafkaProducer] Send failed',
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : 'Unknown error',
        { topic: message.topic },
      );
      throw error;
    }
  }
}
