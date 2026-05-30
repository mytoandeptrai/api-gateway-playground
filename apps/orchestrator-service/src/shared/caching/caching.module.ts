import { Global, Module } from '@nestjs/common';
import { CachingService } from './caching.service';

@Global()
@Module({
  providers: [CachingService],
  exports: [CachingService],
})
export class CachingModule {}
