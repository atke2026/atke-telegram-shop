import { Redis } from 'ioredis';

import type { CachePort } from '../../core/ports/services.js';
import type { Logger } from '../../shared/logger.js';

export class RedisCache implements CachePort {
  constructor(private readonly redis: Redis, private readonly logger: Logger) {}

  static connect(url: string, logger: Logger): RedisCache {
    const redis = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: false });
    const scoped = logger.child({ component: 'RedisCache' });

    redis.on('error', (error) => scoped.error({ err: error }, 'Redis connection error'));
    redis.on('connect', () => scoped.info('Redis connected'));

    return new RedisCache(redis, scoped);
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (error) {
      // A cache miss must never take the bot down — fall through to the database.
      this.logger.warn({ err: error, key }, 'Cache read failed, treating as miss');
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const payload = JSON.stringify(value);
      if (ttlSeconds) {
        await this.redis.set(key, payload, 'EX', ttlSeconds);
      } else {
        await this.redis.set(key, payload);
      }
    } catch (error) {
      this.logger.warn({ err: error, key }, 'Cache write failed');
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
    } catch (error) {
      this.logger.warn({ err: error, key }, 'Cache delete failed');
    }
  }

  async disconnect(): Promise<void> {
    await this.redis.quit();
  }
}
