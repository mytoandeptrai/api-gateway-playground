import { Global, Module } from '@nestjs/common';
import { RedisModule } from '@liaoliaots/nestjs-redis';
import { RedisConfigService } from './redis-config.service';

@Global()
@Module({
  imports: [
    RedisModule.forRootAsync({
      useClass: RedisConfigService,
    }),
  ],
  exports: [RedisModule],
})
export class SharedRedisModule {}
