import { SetMetadata } from '@nestjs/common';
import { CacheStrategy } from '../caching.service';

export const CACHEABLE_KEY = 'cacheable';
export const CACHE_INVALIDATE_KEY = 'cacheInvalidate';

/**
 * Cacheable Configuration
 */
export interface CacheableConfig {
  key?: string | ((args: any[]) => string);
  ttl?: number;
  strategy?: CacheStrategy;
  tags?: string[];
  condition?: (args: any[]) => boolean;
}

/**
 * Cache Invalidate Configuration
 */
export interface CacheInvalidateConfig {
  keys?: string | string[] | ((args: any[]) => string | string[]);
  tags?: string | string[];
  allEntries?: boolean;
}

/**
 * Cacheable decorator
 * Automatically cache method results
 *
 * @param config Cache configuration
 *
 * @example
 * @Cacheable({ key: 'user', ttl: 3600 })
 * async getUser(id: string) { ... }
 */
export const Cacheable = (config: CacheableConfig = {}) =>
  SetMetadata(CACHEABLE_KEY, config);

/**
 * Cache Invalidate decorator
 * Invalidate cache entries when method is called
 *
 * @param config Invalidation configuration
 *
 * @example
 * @CacheInvalidate({ tags: ['users'] })
 * async updateUser(id: string, data: any) { ... }
 */
export const CacheInvalidate = (config: CacheInvalidateConfig = {}) =>
  SetMetadata(CACHE_INVALIDATE_KEY, config);

/**
 * Common cache key builders
 */
export class CacheKeyBuilders {
  /**
   * Build key from all arguments
   */
  static fromArgs(prefix: string): (args: any[]) => string {
    return (args: any[]) => {
      const serialized = args.map((arg) =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg),
      );
      return `${prefix}:${serialized.join(':')}`;
    };
  }

  /**
   * Build key from specific argument
   */
  static fromArg(prefix: string, index: number): (args: any[]) => string {
    return (args: any[]) => {
      const arg = args[index];
      const serialized =
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg);
      return `${prefix}:${serialized}`;
    };
  }

  /**
   * Build key from object property
   */
  static fromProperty(
    prefix: string,
    index: number,
    property: string,
  ): (args: any[]) => string {
    return (args: any[]) => {
      const arg = args[index];
      const value = arg?.[property];
      return `${prefix}:${value}`;
    };
  }
}
