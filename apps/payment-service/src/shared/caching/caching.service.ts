import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@liaoliaots/nestjs-redis';
import Redis from 'ioredis';

/**
 * Cache Strategy Type
 */
export enum CacheStrategy {
  TTL = 'ttl', // Time to live
  LRU = 'lru', // Least Recently Used
  LFU = 'lfu', // Least Frequently Used
  WRITE_THROUGH = 'write_through',
  WRITE_BEHIND = 'write_behind',
  CACHE_ASIDE = 'cache_aside',
}

/**
 * Cache Entry Metadata
 */
export interface CacheMetadata {
  key: string;
  hits: number;
  lastAccessed: number;
  created: number;
  ttl?: number;
  size?: number;
  tags?: string[];
}

/**
 * Cache Statistics
 */
export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
  totalKeys: number;
  memoryUsed: number;
  evictions: number;
}

@Injectable()
export class CachingService {
  private readonly redis: Redis;
  private readonly logger = new Logger(CachingService.name);
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  constructor(private readonly redisService: RedisService) {
    this.redis = this.redisService.getOrThrow();
  }

  /**
   * Get value from cache with strategy
   */
  async get<T>(
    key: string,
    strategy: CacheStrategy = CacheStrategy.TTL,
  ): Promise<T | null> {
    const fullKey = this.buildKey(key);

    try {
      const value = await this.redis.get(fullKey);

      if (value) {
        this.stats.hits++;

        // Update metadata based on strategy
        await this.updateMetadata(fullKey, strategy);

        return JSON.parse(value) as T;
      }

      this.stats.misses++;
      return null;
    } catch (error) {
      this.logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set value in cache with strategy
   */
  async set<T>(
    key: string,
    value: T,
    options: {
      ttl?: number; // seconds
      strategy?: CacheStrategy;
      tags?: string[];
      maxSize?: number;
    } = {},
  ): Promise<void> {
    const fullKey = this.buildKey(key);
    const strategy = options.strategy || CacheStrategy.TTL;

    try {
      const serialized = JSON.stringify(value);

      // Check size if maxSize is specified
      if (options.maxSize && serialized.length > options.maxSize) {
        this.logger.warn(`Value too large for cache: ${key}`);
        return;
      }

      // Apply strategy
      switch (strategy) {
        case CacheStrategy.TTL:
          await this.setWithTTL(fullKey, serialized, options.ttl || 3600);
          break;

        case CacheStrategy.LRU:
          await this.setWithLRU(fullKey, serialized, options.ttl);
          break;

        case CacheStrategy.LFU:
          await this.setWithLFU(fullKey, serialized, options.ttl);
          break;

        case CacheStrategy.WRITE_THROUGH:
          await this.setWriteThrough(fullKey, serialized, options.ttl);
          break;

        case CacheStrategy.CACHE_ASIDE:
          await this.setCacheAside(fullKey, serialized, options.ttl);
          break;

        default:
          await this.setWithTTL(fullKey, serialized, options.ttl || 3600);
      }

      // Store metadata
      await this.storeMetadata(fullKey, {
        key: fullKey,
        hits: 0,
        lastAccessed: Date.now(),
        created: Date.now(),
        ttl: options.ttl,
        size: serialized.length,
        tags: options.tags,
      });
    } catch (error) {
      this.logger.error(`Cache set error for key ${key}:`, error);
    }
  }

  /**
   * Delete from cache
   */
  async delete(key: string): Promise<void> {
    const fullKey = this.buildKey(key);

    try {
      await this.redis.del(fullKey, `${fullKey}:meta`);
    } catch (error) {
      this.logger.error(`Cache delete error for key ${key}:`, error);
    }
  }

  /**
   * Delete by tag
   */
  async deleteByTag(tag: string): Promise<number> {
    try {
      let cursor = '0';
      let deletedCount = 0;

      do {
        const [newCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          'cache:*:meta',
          'COUNT',
          100,
        );
        cursor = newCursor;

        for (const metaKey of keys) {
          const metadata = await this.redis.get(metaKey);
          if (metadata) {
            const meta = JSON.parse(metadata) as CacheMetadata;
            if (meta.tags?.includes(tag)) {
              const dataKey = metaKey.replace(':meta', '');
              await this.redis.del(dataKey, metaKey);
              deletedCount++;
            }
          }
        }
      } while (cursor !== '0');

      this.logger.log(`Deleted ${deletedCount} cache entries with tag: ${tag}`);
      return deletedCount;
    } catch (error) {
      this.logger.error(`Cache delete by tag error:`, error);
      return 0;
    }
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    try {
      let cursor = '0';
      let count = 0;

      do {
        const [newCursor, keys] = await this.redis.scan(
          cursor,
          'MATCH',
          'cache:*',
          'COUNT',
          100,
        );
        cursor = newCursor;

        if (keys.length > 0) {
          await this.redis.del(...keys);
          count += keys.length;
        }
      } while (cursor !== '0');

      this.logger.log(`Cleared ${count} cache entries`);
    } catch (error) {
      this.logger.error(`Cache clear error:`, error);
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const totalKeys = await this.countKeys();
    const memoryInfo = await this.redis.info('memory');
    const memoryUsed = this.parseMemoryUsed(memoryInfo);

    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate =
      totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: Math.round(hitRate * 100) / 100,
      totalKeys,
      memoryUsed,
      evictions: this.stats.evictions,
    };
  }

  /**
   * Warm up cache with data
   */
  async warmup(
    data: Array<{ key: string; value: any; ttl?: number }>,
  ): Promise<void> {
    this.logger.log(`Warming up cache with ${data.length} entries`);

    const pipeline = this.redis.pipeline();

    for (const item of data) {
      const fullKey = this.buildKey(item.key);
      const serialized = JSON.stringify(item.value);

      if (item.ttl) {
        pipeline.setex(fullKey, item.ttl, serialized);
      } else {
        pipeline.set(fullKey, serialized);
      }
    }

    await pipeline.exec();
    this.logger.log('Cache warmup complete');
  }

  // ========================================
  // Private Strategy Implementations
  // ========================================

  /**
   * Set with TTL strategy
   */
  private async setWithTTL(
    key: string,
    value: string,
    ttl: number,
  ): Promise<void> {
    await this.redis.setex(key, ttl, value);
  }

  /**
   * Set with LRU strategy
   */
  private async setWithLRU(
    key: string,
    value: string,
    ttl?: number,
  ): Promise<void> {
    // In LRU, we track access time
    if (ttl) {
      await this.redis.setex(key, ttl, value);
    } else {
      await this.redis.set(key, value);
    }

    // Update LRU tracking
    await this.redis.zadd('cache:lru', Date.now(), key);

    // Evict least recently used if needed
    await this.evictLRU();
  }

  /**
   * Set with LFU strategy
   */
  private async setWithLFU(
    key: string,
    value: string,
    ttl?: number,
  ): Promise<void> {
    if (ttl) {
      await this.redis.setex(key, ttl, value);
    } else {
      await this.redis.set(key, value);
    }

    // Initialize frequency counter
    await this.redis.zincrby('cache:lfu', 1, key);

    // Evict least frequently used if needed
    await this.evictLFU();
  }

  /**
   * Set with write-through strategy
   */
  private async setWriteThrough(
    key: string,
    value: string,
    ttl?: number,
  ): Promise<void> {
    // In write-through, we would also write to DB
    // For now, just cache
    if (ttl) {
      await this.redis.setex(key, ttl, value);
    } else {
      await this.redis.set(key, value);
    }
  }

  /**
   * Set with cache-aside strategy
   */
  private async setCacheAside(
    key: string,
    value: string,
    ttl?: number,
  ): Promise<void> {
    // Cache-aside is lazy loading - set on miss
    if (ttl) {
      await this.redis.setex(key, ttl, value);
    } else {
      await this.redis.set(key, value);
    }
  }

  /**
   * Update metadata on access
   */
  private async updateMetadata(
    key: string,
    strategy: CacheStrategy,
  ): Promise<void> {
    const metaKey = `${key}:meta`;
    const metadata = await this.redis.get(metaKey);

    if (metadata) {
      const meta = JSON.parse(metadata) as CacheMetadata;
      meta.hits++;
      meta.lastAccessed = Date.now();

      await this.redis.set(metaKey, JSON.stringify(meta));

      // Update strategy-specific tracking
      if (strategy === CacheStrategy.LRU) {
        await this.redis.zadd('cache:lru', Date.now(), key);
      } else if (strategy === CacheStrategy.LFU) {
        await this.redis.zincrby('cache:lfu', 1, key);
      }
    }
  }

  /**
   * Store cache metadata
   */
  private async storeMetadata(
    key: string,
    metadata: CacheMetadata,
  ): Promise<void> {
    const metaKey = `${key}:meta`;
    await this.redis.set(metaKey, JSON.stringify(metadata));

    if (metadata.ttl) {
      await this.redis.expire(metaKey, metadata.ttl);
    }
  }

  /**
   * Evict least recently used entries
   */
  private async evictLRU(): Promise<void> {
    const maxKeys = 10000; // Configurable
    const keyCount = await this.redis.zcard('cache:lru');

    if (keyCount > maxKeys) {
      // Remove oldest 10%
      const toRemove = Math.floor(keyCount * 0.1);
      const oldestKeys = await this.redis.zrange('cache:lru', 0, toRemove - 1);

      for (const key of oldestKeys) {
        await this.redis.del(key, `${key}:meta`);
        this.stats.evictions++;
      }

      await this.redis.zremrangebyrank('cache:lru', 0, toRemove - 1);
      this.logger.log(`Evicted ${toRemove} LRU entries`);
    }
  }

  /**
   * Evict least frequently used entries
   */
  private async evictLFU(): Promise<void> {
    const maxKeys = 10000; // Configurable
    const keyCount = await this.redis.zcard('cache:lfu');

    if (keyCount > maxKeys) {
      // Remove least used 10%
      const toRemove = Math.floor(keyCount * 0.1);
      const leastUsedKeys = await this.redis.zrange(
        'cache:lfu',
        0,
        toRemove - 1,
      );

      for (const key of leastUsedKeys) {
        await this.redis.del(key, `${key}:meta`);
        this.stats.evictions++;
      }

      await this.redis.zremrangebyrank('cache:lfu', 0, toRemove - 1);
      this.logger.log(`Evicted ${toRemove} LFU entries`);
    }
  }

  /**
   * Build full cache key
   */
  private buildKey(key: string): string {
    return `cache:${key}`;
  }

  /**
   * Count total cache keys
   */
  private async countKeys(): Promise<number> {
    let cursor = '0';
    let count = 0;

    do {
      const [newCursor, keys] = await this.redis.scan(
        cursor,
        'MATCH',
        'cache:*',
        'COUNT',
        100,
      );
      cursor = newCursor;
      count += keys.filter((k) => !k.endsWith(':meta')).length;
    } while (cursor !== '0');

    return count;
  }

  /**
   * Parse memory used from Redis INFO
   */
  private parseMemoryUsed(memoryInfo: string): number {
    const match = memoryInfo.match(/used_memory:(\d+)/);
    return match ? parseInt(match[1]) : 0;
  }
}
