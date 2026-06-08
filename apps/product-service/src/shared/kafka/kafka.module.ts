import { Global, Module } from '@nestjs/common';
import { KafkaConfigService } from './utils/kafka.config';
import { KafkaConsumer } from './utils/kafka.consumer';

@Global()
@Module({
  providers: [KafkaConfigService, KafkaConsumer],
  exports: [KafkaConfigService, KafkaConsumer],
})
export class KafkaModule {}
