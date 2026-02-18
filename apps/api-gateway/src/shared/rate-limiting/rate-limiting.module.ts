import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RateLimitingService } from './rate-limiting.service';
import { RateLimitingController } from './rate-limiting.controller';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { RateLimitRule } from './entities/rate-limit-rule.entity';
import { RateLimitViolation } from './entities/rate-limit-violation.entity';

/**
 * Rate Limiting Module
 * Production-ready rate limiting with multiple algorithms
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([RateLimitRule, RateLimitViolation])],
  controllers: [RateLimitingController],
  providers: [RateLimitingService, RateLimitGuard],
  exports: [RateLimitingService, RateLimitGuard],
})
export class RateLimitingModule {}
