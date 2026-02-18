import { SetMetadata } from '@nestjs/common';
import { RateLimitAlgorithm } from '../entities/rate-limit-rule.entity';

export const RATE_LIMIT_KEY = 'rateLimit';

/**
 * Rate Limit Configuration
 */
export interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
  algorithm?: RateLimitAlgorithm;
  message?: string;
}

/**
 * Apply rate limiting to route
 * @param config Rate limit configuration
 */
export const RateLimit = (config: RateLimitConfig) =>
  SetMetadata(RATE_LIMIT_KEY, config);

/**
 * Skip rate limiting for this route
 */
export const SkipRateLimit = () => SetMetadata('skipRateLimit', true);

/**
 * Common rate limit presets
 */
export class RateLimitPresets {
  /**
   * Strict: 10 requests per minute
   */
  static readonly STRICT: RateLimitConfig = {
    maxRequests: 10,
    windowSeconds: 60,
    algorithm: RateLimitAlgorithm.SLIDING_WINDOW,
  };

  /**
   * Standard: 60 requests per minute
   */
  static readonly STANDARD: RateLimitConfig = {
    maxRequests: 60,
    windowSeconds: 60,
    algorithm: RateLimitAlgorithm.SLIDING_WINDOW,
  };

  /**
   * Relaxed: 300 requests per minute
   */
  static readonly RELAXED: RateLimitConfig = {
    maxRequests: 300,
    windowSeconds: 60,
    algorithm: RateLimitAlgorithm.TOKEN_BUCKET,
  };

  /**
   * API: 1000 requests per hour
   */
  static readonly API: RateLimitConfig = {
    maxRequests: 1000,
    windowSeconds: 3600,
    algorithm: RateLimitAlgorithm.SLIDING_WINDOW,
  };

  /**
   * Burst: Allow bursts with token bucket
   */
  static readonly BURST: RateLimitConfig = {
    maxRequests: 100,
    windowSeconds: 60,
    algorithm: RateLimitAlgorithm.TOKEN_BUCKET,
  };

  /**
   * Auth: For authentication endpoints (strict)
   */
  static readonly AUTH: RateLimitConfig = {
    maxRequests: 5,
    windowSeconds: 60,
    algorithm: RateLimitAlgorithm.FIXED_WINDOW,
    message: 'Too many authentication attempts. Please try again later.',
  };

  /**
   * Public API: For public-facing endpoints
   */
  static readonly PUBLIC_API: RateLimitConfig = {
    maxRequests: 100,
    windowSeconds: 3600,
    algorithm: RateLimitAlgorithm.SLIDING_WINDOW,
  };
}
