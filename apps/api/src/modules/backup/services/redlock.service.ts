import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@liaoliaots/nestjs-redis';
import Redlock, { Lock } from 'redlock';

const BACKUP_LOCK_KEY = 'backup:operation:lock';
const BACKUP_LOCK_TTL = 60 * 60 * 1000; // 1 hour in ms

@Injectable()
export class RedlockService {
  private readonly logger = new Logger(RedlockService.name);
  private readonly redlock: Redlock;

  constructor(private readonly redisService: RedisService) {
    const redisClient = this.redisService.getOrThrow();
    // retryCount: 0 — fail fast if a backup/restore is already running (lock TTL is 1h, retrying makes no sense)
    // `as never`: pnpm resolves two ioredis versions (5.9.3 via redlock types, 5.10.1 via project),
    // types are structurally incompatible but runtime-compatible — standard escape hatch
    this.redlock = new Redlock([redisClient as never], {
      retryCount: 0,
      retryDelay: 200,
      retryJitter: 100,
    });
    this.redlock.on('error', (err) => {
      this.logger.error(
        '[Redlock] Error',
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Unknown error',
      );
    });
  }

  async acquireBackupLock(): Promise<Lock> {
    return this.redlock.acquire([BACKUP_LOCK_KEY], BACKUP_LOCK_TTL);
  }

  async releaseLock(lock: Lock): Promise<void> {
    try {
      await lock.release();
    } catch (err) {
      this.logger.warn(
        '[Redlock] Release failed (lock may have expired)',
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Unknown error',
      );
    }
  }
}
