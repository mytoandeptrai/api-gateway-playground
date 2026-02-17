import { Global, Module } from '@nestjs/common';
import { RedisModule } from '@liaoliaots/nestjs-redis';
import { CachingService } from './caching.service';
import { RedisConfigService } from './redis-config.service';

@Global()
@Module({
  imports: [
    RedisModule.forRootAsync({
      useClass: RedisConfigService,
    }),
  ],
  providers: [CachingService],
  exports: [CachingService],
})
export class CachingModule {}
