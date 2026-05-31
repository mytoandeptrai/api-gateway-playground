import { Global, Module } from '@nestjs/common';
import { KafkaAdmin } from './utils/kafka.admin';
import { KafkaConfigService } from './utils/kafka.config';
import { KafkaConsumer } from './utils/kafka.consumer';
import { KafkaProducer } from './utils/kafka.producer';

@Global()
@Module({
  providers: [KafkaConfigService, KafkaAdmin, KafkaProducer, KafkaConsumer],
  exports: [KafkaConfigService, KafkaAdmin, KafkaProducer, KafkaConsumer],
})
export class KafkaModule {}
