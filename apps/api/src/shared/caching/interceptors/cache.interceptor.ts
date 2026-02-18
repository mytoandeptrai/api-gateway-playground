import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CachingService } from '../caching.service';
import {
  CACHEABLE_KEY,
  CACHE_INVALIDATE_KEY,
  CacheableConfig,
  CacheInvalidateConfig,
} from '../decorators/cacheable.decorator';

/**
 * Cache Interceptor
 * Automatically caches method results based on @Cacheable decorator
 */
@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private cacheStrategy: CachingService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const cacheableConfig = this.reflector.get<CacheableConfig>(
      CACHEABLE_KEY,
      context.getHandler(),
    );

    const invalidateConfig = this.reflector.get<CacheInvalidateConfig>(
      CACHE_INVALIDATE_KEY,
      context.getHandler(),
    );

    const args = context.getArgs();

    // Handle cache invalidation
    if (invalidateConfig) {
      await this.handleInvalidation(invalidateConfig, args);
    }

    // Handle caching
    if (cacheableConfig) {
      return this.handleCaching(cacheableConfig, args, next);
    }

    return next.handle();
  }

  private async handleCaching(
    config: CacheableConfig,
    args: any[],
    next: CallHandler,
  ): Promise<Observable<any>> {
    // Check condition
    if (config.condition && !config.condition(args)) {
      return next.handle();
    }

    // Build cache key
    const key = this.buildCacheKey(config.key, args);

    // Try to get from cache
    const cached = await this.cacheStrategy.get(key, config.strategy);

    if (cached !== null) {
      return of(cached);
    }

    // Execute and cache result
    return next.handle().pipe(
      tap((result) => {
        this.cacheStrategy
          .set(key, result, {
            ttl: config.ttl,
            strategy: config.strategy,
            tags: config.tags,
          })
          .catch((error) => {
            const message = error instanceof Error ? error.message : error;
            console.error(`Cache set error for key ${key}: ${message}`);
          });
      }),
    );
  }

  private async handleInvalidation(
    config: CacheInvalidateConfig,
    args: any[],
  ): Promise<void> {
    if (config.allEntries) {
      await this.cacheStrategy.clear();
      return;
    }

    if (config.tags) {
      const tags = Array.isArray(config.tags) ? config.tags : [config.tags];
      for (const tag of tags) {
        await this.cacheStrategy.deleteByTag(tag);
      }
    }

    if (config.keys) {
      const keys = this.buildInvalidationKeys(config.keys, args);
      for (const key of keys) {
        await this.cacheStrategy.delete(key);
      }
    }
  }

  private buildCacheKey(
    keyConfig: string | ((args: any[]) => string) | undefined,
    args: any[],
  ): string {
    if (typeof keyConfig === 'function') {
      return keyConfig(args);
    }

    if (typeof keyConfig === 'string') {
      return keyConfig;
    }

    // Default: use all args
    return `default:${JSON.stringify(args)}`;
  }

  private buildInvalidationKeys(
    keysConfig: string | string[] | ((args: any[]) => string | string[]),
    args: any[],
  ): string[] {
    if (typeof keysConfig === 'function') {
      const result = keysConfig(args);
      return Array.isArray(result) ? result : [result];
    }

    return Array.isArray(keysConfig) ? keysConfig : [keysConfig];
  }
}
