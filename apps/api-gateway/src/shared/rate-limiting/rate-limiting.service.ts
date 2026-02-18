import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RateLimitRule,
  RateLimitAlgorithm,
  RateLimitScope,
} from './entities/rate-limit-rule.entity';
import { RateLimitViolation } from './entities/rate-limit-violation.entity';
import Redis from 'ioredis';
import { RedisService } from '@liaoliaots/nestjs-redis';

/**
 * Rate Limit Check Result
 */
export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
  rule?: RateLimitRule;
}

/**
 * Rate Limit Context
 */
export interface RateLimitContext {
  tenantId?: string;
  userId?: string;
  ipAddress: string;
  endpoint: string;
  method: string;
  userAgent?: string;
  headers?: Record<string, any>;
}

/**
 * Rate Limiting Service
 * Production-ready rate limiting with multiple algorithms
 */
@Injectable()
export class RateLimitingService {
  private readonly redis: Redis;
  private readonly logger = new Logger(RateLimitingService.name);

  constructor(
    @InjectRepository(RateLimitRule)
    private ruleRepository: Repository<RateLimitRule>,
    @InjectRepository(RateLimitViolation)
    private violationRepository: Repository<RateLimitViolation>,
    private readonly redisService: RedisService,
  ) {
    this.redis = this.redisService.getOrThrow();
  }

  /**
   * Check if request should be rate limited
   */
  async checkRateLimit(context: RateLimitContext): Promise<RateLimitResult> {
    // Find applicable rules (ordered by priority)
    const rules = await this.findApplicableRules(context);

    if (rules.length === 0) {
      // No rules - allow
      return {
        allowed: true,
        limit: Infinity,
        remaining: Infinity,
        resetAt: new Date(Date.now() + 3600000),
      };
    }

    // Check each rule (most restrictive wins)
    let mostRestrictive: RateLimitResult | null = null;

    for (const rule of rules) {
      const result = await this.checkRule(rule, context);

      if (!result.allowed) {
        // Rule violated - log and return immediately
        await this.logViolation(rule, context, result);
        return result;
      }

      // Track most restrictive rule
      if (!mostRestrictive || result.remaining < mostRestrictive.remaining) {
        mostRestrictive = result;
      }
    }

    return (
      mostRestrictive || {
        allowed: true,
        limit: Infinity,
        remaining: Infinity,
        resetAt: new Date(Date.now() + 3600000),
      }
    );
  }

  /**
   * Increment request counter (call after allowing request)
   */
  async incrementCounter(context: RateLimitContext): Promise<void> {
    const rules = await this.findApplicableRules(context);

    for (const rule of rules) {
      await this.incrementRuleCounter(rule, context);
    }
  }

  /**
   * Get current rate limit status
   */
  async getRateLimitStatus(
    context: RateLimitContext,
  ): Promise<RateLimitResult> {
    return this.checkRateLimit(context);
  }

  /**
   * Reset rate limit for specific context
   */
  async resetRateLimit(context: Partial<RateLimitContext>): Promise<void> {
    const keys = await this.getRedisKeys(context);

    if (keys.length > 0) {
      await this.redis.del(...keys);
      this.logger.log(`Reset rate limit for ${keys.length} keys`);
    }
  }

  /**
   * Create or update rate limit rule
   */
  async createRule(params: {
    name: string;
    scope: RateLimitScope;
    scopeValue?: string;
    endpoint?: string;
    algorithm: RateLimitAlgorithm;
    maxRequests: number;
    windowSeconds: number;
    burstSize?: number;
    refillRate?: number;
    priority?: number;
  }): Promise<RateLimitRule> {
    const rule = this.ruleRepository.create(params);
    return this.ruleRepository.save(rule);
  }

  /**
   * Get violations for analysis
   */
  async getViolations(params: {
    tenantId?: string;
    userId?: string;
    endpoint?: string;
    ipAddress?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<RateLimitViolation[]> {
    const query = this.violationRepository.createQueryBuilder('violation');

    if (params.tenantId) {
      query.andWhere('violation.tenantId = :tenantId', {
        tenantId: params.tenantId,
      });
    }

    if (params.userId) {
      query.andWhere('violation.userId = :userId', { userId: params.userId });
    }

    if (params.endpoint) {
      query.andWhere('violation.endpoint LIKE :endpoint', {
        endpoint: `%${params.endpoint}%`,
      });
    }

    if (params.ipAddress) {
      query.andWhere('violation.ipAddress = :ipAddress', {
        ipAddress: params.ipAddress,
      });
    }

    if (params.startDate) {
      query.andWhere('violation.createdAt >= :startDate', {
        startDate: params.startDate,
      });
    }

    if (params.endDate) {
      query.andWhere('violation.createdAt <= :endDate', {
        endDate: params.endDate,
      });
    }

    query.orderBy('violation.createdAt', 'DESC');

    if (params.limit) {
      query.take(params.limit);
    }

    return query.getMany();
  }

  // ========================================
  // Private Algorithm Implementations
  // ========================================

  /**
   * Check rate limit rule
   */
  private async checkRule(
    rule: RateLimitRule,
    context: RateLimitContext,
  ): Promise<RateLimitResult> {
    switch (rule.algorithm) {
      case RateLimitAlgorithm.TOKEN_BUCKET:
        return this.checkTokenBucket(rule, context);

      case RateLimitAlgorithm.SLIDING_WINDOW:
        return this.checkSlidingWindow(rule, context);

      case RateLimitAlgorithm.FIXED_WINDOW:
        return this.checkFixedWindow(rule, context);

      case RateLimitAlgorithm.LEAKY_BUCKET:
        return this.checkLeakyBucket(rule, context);

      default:
        return this.checkFixedWindow(rule, context);
    }
  }

  /**
   * Token Bucket Algorithm
   * Allows burst traffic while maintaining average rate
   */
  private async checkTokenBucket(
    rule: RateLimitRule,
    context: RateLimitContext,
  ): Promise<RateLimitResult> {
    const key = this.getRedisKey(rule, context);
    const now = Date.now();

    // Get current bucket state
    const bucketData = await this.redis.get(key);
    let tokens: number;
    let lastRefill: number;

    if (bucketData) {
      const parsed = JSON.parse(bucketData);
      tokens = parsed.tokens;
      lastRefill = parsed.lastRefill;

      // Refill tokens based on time elapsed
      const elapsed = (now - lastRefill) / 1000; // seconds
      const refillRate =
        rule.refillRate || rule.maxRequests / rule.windowSeconds;
      const tokensToAdd = elapsed * refillRate;

      tokens = Math.min(
        rule.burstSize || rule.maxRequests,
        tokens + tokensToAdd,
      );
    } else {
      // Initialize bucket
      tokens = rule.burstSize || rule.maxRequests;
      lastRefill = now;
    }

    const allowed = tokens >= 1;

    if (allowed) {
      // Will be decremented after request is allowed
      const newTokens = tokens;
      const resetAt = new Date(
        now +
          (((rule.burstSize || rule.maxRequests) - newTokens) /
            (rule.refillRate || 1)) *
            1000,
      );

      return {
        allowed: true,
        limit: rule.burstSize || rule.maxRequests,
        remaining: Math.floor(newTokens),
        resetAt,
        rule,
      };
    } else {
      // Rate limited
      const refillRate =
        rule.refillRate || rule.maxRequests / rule.windowSeconds;
      const retryAfter = Math.ceil((1 - tokens) / refillRate);

      return {
        allowed: false,
        limit: rule.burstSize || rule.maxRequests,
        remaining: 0,
        resetAt: new Date(now + retryAfter * 1000),
        retryAfter,
        rule,
      };
    }
  }

  /**
   * Sliding Window Algorithm
   * Smooth rate limiting without boundary reset issues
   */
  private async checkSlidingWindow(
    rule: RateLimitRule,
    context: RateLimitContext,
  ): Promise<RateLimitResult> {
    const key = this.getRedisKey(rule, context);
    const now = Date.now();
    const windowMs = rule.windowSeconds * 1000;
    const windowStart = now - windowMs;

    // Use Redis sorted set with timestamps as scores
    const requestKey = `${key}:requests`;

    // Remove old requests outside the window
    await this.redis.zremrangebyscore(requestKey, 0, windowStart);

    // Count requests in current window
    const count = await this.redis.zcard(requestKey);

    const allowed = count < rule.maxRequests;
    const remaining = Math.max(0, rule.maxRequests - count);

    // Get oldest request to calculate reset time
    const oldestRequest = await this.redis.zrange(
      requestKey,
      0,
      0,
      'WITHSCORES',
    );
    const resetAt =
      oldestRequest.length > 0
        ? new Date(parseInt(oldestRequest[1]) + windowMs)
        : new Date(now + windowMs);

    if (!allowed) {
      const retryAfter = Math.ceil((resetAt.getTime() - now) / 1000);
      return {
        allowed: false,
        limit: rule.maxRequests,
        remaining: 0,
        resetAt,
        retryAfter,
        rule,
      };
    }

    return {
      allowed: true,
      limit: rule.maxRequests,
      remaining,
      resetAt,
      rule,
    };
  }

  /**
   * Fixed Window Algorithm
   * Simple counter that resets at window boundaries
   */
  private async checkFixedWindow(
    rule: RateLimitRule,
    context: RateLimitContext,
  ): Promise<RateLimitResult> {
    const key = this.getRedisKey(rule, context);
    const now = Date.now();
    const windowMs = rule.windowSeconds * 1000;

    // Calculate current window
    const currentWindow = Math.floor(now / windowMs);
    const windowKey = `${key}:${currentWindow}`;

    // Get current count
    const count = await this.redis.get(windowKey);
    const currentCount = count ? parseInt(count) : 0;

    const allowed = currentCount < rule.maxRequests;
    const remaining = Math.max(0, rule.maxRequests - currentCount);

    // Calculate reset time (end of current window)
    const windowEnd = (currentWindow + 1) * windowMs;
    const resetAt = new Date(windowEnd);

    if (!allowed) {
      const retryAfter = Math.ceil((windowEnd - now) / 1000);
      return {
        allowed: false,
        limit: rule.maxRequests,
        remaining: 0,
        resetAt,
        retryAfter,
        rule,
      };
    }

    return {
      allowed: true,
      limit: rule.maxRequests,
      remaining,
      resetAt,
      rule,
    };
  }

  /**
   * Leaky Bucket Algorithm
   * Smooths out bursts by processing at constant rate
   */
  private async checkLeakyBucket(
    rule: RateLimitRule,
    context: RateLimitContext,
  ): Promise<RateLimitResult> {
    const key = this.getRedisKey(rule, context);
    const now = Date.now();

    // Get bucket state
    const bucketData = await this.redis.get(key);
    let queueSize: number;
    let lastLeak: number;

    if (bucketData) {
      const parsed = JSON.parse(bucketData);
      queueSize = parsed.queueSize;
      lastLeak = parsed.lastLeak;

      // Leak tokens based on time elapsed
      const elapsed = (now - lastLeak) / 1000; // seconds
      const leakRate = rule.maxRequests / rule.windowSeconds;
      const leaked = elapsed * leakRate;

      queueSize = Math.max(0, queueSize - leaked);
    } else {
      queueSize = 0;
      lastLeak = now;
    }

    const allowed = queueSize < rule.maxRequests;

    if (allowed) {
      const remaining = Math.floor(rule.maxRequests - queueSize);
      const leakRate = rule.maxRequests / rule.windowSeconds;
      const timeToEmpty = queueSize / leakRate;
      const resetAt = new Date(now + timeToEmpty * 1000);

      return {
        allowed: true,
        limit: rule.maxRequests,
        remaining,
        resetAt,
        rule,
      };
    } else {
      const leakRate = rule.maxRequests / rule.windowSeconds;
      const retryAfter = Math.ceil(
        (queueSize - rule.maxRequests + 1) / leakRate,
      );

      return {
        allowed: false,
        limit: rule.maxRequests,
        remaining: 0,
        resetAt: new Date(now + retryAfter * 1000),
        retryAfter,
        rule,
      };
    }
  }

  /**
   * Increment counter after allowing request
   */
  private async incrementRuleCounter(
    rule: RateLimitRule,
    context: RateLimitContext,
  ): Promise<void> {
    const key = this.getRedisKey(rule, context);
    const now = Date.now();

    switch (rule.algorithm) {
      case RateLimitAlgorithm.TOKEN_BUCKET: {
        const bucketData = await this.redis.get(key);
        let tokens: number;
        let lastRefill: number;

        if (bucketData) {
          const parsed = JSON.parse(bucketData);
          tokens = parsed.tokens;
          lastRefill = parsed.lastRefill;

          // Refill
          const elapsed = (now - lastRefill) / 1000;
          const refillRate =
            rule.refillRate || rule.maxRequests / rule.windowSeconds;
          tokens = Math.min(
            rule.burstSize || rule.maxRequests,
            tokens + elapsed * refillRate,
          );
        } else {
          tokens = rule.burstSize || rule.maxRequests;
          lastRefill = now;
        }

        // Consume 1 token
        tokens = Math.max(0, tokens - 1);

        await this.redis.set(
          key,
          JSON.stringify({ tokens, lastRefill: now }),
          'EX',
          rule.windowSeconds * 2,
        );
        break;
      }

      case RateLimitAlgorithm.SLIDING_WINDOW: {
        const requestKey = `${key}:requests`;
        await this.redis.zadd(requestKey, now, `${now}-${Math.random()}`);
        await this.redis.expire(requestKey, rule.windowSeconds * 2);
        break;
      }

      case RateLimitAlgorithm.FIXED_WINDOW: {
        const windowMs = rule.windowSeconds * 1000;
        const currentWindow = Math.floor(now / windowMs);
        const windowKey = `${key}:${currentWindow}`;

        await this.redis.incr(windowKey);
        await this.redis.expire(windowKey, rule.windowSeconds * 2);
        break;
      }

      case RateLimitAlgorithm.LEAKY_BUCKET: {
        const bucketData = await this.redis.get(key);
        let queueSize: number;
        let lastLeak: number;

        if (bucketData) {
          const parsed = JSON.parse(bucketData);
          queueSize = parsed.queueSize;
          lastLeak = parsed.lastLeak;

          // Leak
          const elapsed = (now - lastLeak) / 1000;
          const leakRate = rule.maxRequests / rule.windowSeconds;
          queueSize = Math.max(0, queueSize - elapsed * leakRate);
        } else {
          queueSize = 0;
          lastLeak = now;
        }

        // Add 1 to queue
        queueSize += 1;

        await this.redis.set(
          key,
          JSON.stringify({ queueSize, lastLeak: now }),
          'EX',
          rule.windowSeconds * 2,
        );
        break;
      }
    }
  }

  /**
   * Find applicable rules for context
   */
  private async findApplicableRules(
    context: RateLimitContext,
  ): Promise<RateLimitRule[]> {
    const query = this.ruleRepository
      .createQueryBuilder('rule')
      .where('rule.enabled = :enabled', { enabled: true });

    // Build OR conditions for matching rules
    const conditions: string[] = [];
    const parameters: Record<string, any> = {};

    // Global rules
    conditions.push('rule.scope = :globalScope');
    parameters.globalScope = RateLimitScope.GLOBAL;

    // Tenant rules
    if (context.tenantId) {
      conditions.push(
        '(rule.scope = :tenantScope AND rule.scopeValue = :tenantId)',
      );
      parameters.tenantScope = RateLimitScope.TENANT;
      parameters.tenantId = context.tenantId;
    }

    // User rules
    if (context.userId) {
      conditions.push(
        '(rule.scope = :userScope AND rule.scopeValue = :userId)',
      );
      parameters.userScope = RateLimitScope.USER;
      parameters.userId = context.userId;
    }

    // IP rules
    conditions.push('(rule.scope = :ipScope AND rule.scopeValue = :ipAddress)');
    parameters.ipScope = RateLimitScope.IP;
    parameters.ipAddress = context.ipAddress;

    // Endpoint rules
    conditions.push(
      "(rule.scope = :endpointScope AND :endpoint LIKE CONCAT(rule.scopeValue, '%'))",
    );
    parameters.endpointScope = RateLimitScope.ENDPOINT;
    parameters.endpoint = context.endpoint;

    query.andWhere(`(${conditions.join(' OR ')})`, parameters);

    // Check endpoint-specific rules
    query.andWhere(
      "(rule.endpoint IS NULL OR :endpoint LIKE CONCAT(rule.endpoint, '%'))",
      { endpoint: context.endpoint },
    );

    query.orderBy('rule.priority', 'DESC');

    return query.getMany();
  }

  /**
   * Generate Redis key for rule and context
   */
  private getRedisKey(rule: RateLimitRule, context: RateLimitContext): string {
    const parts = ['ratelimit', rule.id];

    switch (rule.scope) {
      case RateLimitScope.TENANT:
        parts.push(context.tenantId || 'unknown');
        break;
      case RateLimitScope.USER:
        parts.push(context.userId || 'unknown');
        break;
      case RateLimitScope.IP:
        parts.push(context.ipAddress);
        break;
      case RateLimitScope.ENDPOINT:
        parts.push(context.endpoint.replace(/\//g, ':'));
        break;
    }

    if (rule.endpoint) {
      parts.push(context.endpoint.replace(/\//g, ':'));
    }

    return parts.join(':');
  }

  /**
   * Get Redis keys for context (for reset)
   */
  private async getRedisKeys(
    context: Partial<RateLimitContext>,
  ): Promise<string[]> {
    const pattern = 'ratelimit:*';
    let cursor = '0';
    const keys: string[] = [];

    do {
      const [newCursor, foundKeys] = await this.redis.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = newCursor;

      // Filter keys based on context
      for (const key of foundKeys) {
        let matches = true;

        if (context.tenantId && !key.includes(context.tenantId)) {
          matches = false;
        }

        if (context.userId && !key.includes(context.userId)) {
          matches = false;
        }

        if (context.ipAddress && !key.includes(context.ipAddress)) {
          matches = false;
        }

        if (matches) {
          keys.push(key);
        }
      }
    } while (cursor !== '0');

    return keys;
  }

  /**
   * Log rate limit violation
   */
  private async logViolation(
    rule: RateLimitRule,
    context: RateLimitContext,
    result: RateLimitResult,
  ): Promise<void> {
    try {
      const violation = this.violationRepository.create({
        tenantId: context.tenantId,
        userId: context.userId,
        ipAddress: context.ipAddress,
        endpoint: context.endpoint,
        method: context.method,
        ruleId: rule.id,
        ruleName: rule.name,
        requestCount: result.limit - result.remaining + 1,
        limitValue: result.limit,
        windowSeconds: rule.windowSeconds,
        userAgent: context.userAgent,
        requestHeaders: context.headers,
      });

      await this.violationRepository.save(violation);

      this.logger.warn(
        `Rate limit exceeded: ${rule.name} for ${context.ipAddress} on ${context.endpoint}`,
      );
    } catch (error) {
      this.logger.error('Failed to log rate limit violation:', error);
    }
  }
}
