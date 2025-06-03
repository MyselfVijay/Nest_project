import { Injectable, OnModuleDestroy, OnModuleInit, Logger } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private static instance: Redis;
  private client: Redis;
  private readonly logger = new Logger(RedisService.name);

  async onModuleInit() {
    if (RedisService.instance) {
      this.client = RedisService.instance;
      return;
    }

    const host = process.env.REDIS_HOST || 'localhost';
    const port = process.env.REDIS_PORT || '6379';
    const password = process.env.REDIS_PASSWORD || '';

    this.logger.debug(`Initializing Redis connection to ${host}:${port}`);

    this.client = new Redis({
      host,
      port: parseInt(port, 10),
      password: password || undefined,
      retryStrategy(times) {
        const maxRetryDelay = 5000;
        const delay = Math.min(times * 200, maxRetryDelay);
        return delay;
      },
      maxRetriesPerRequest: 10,
      connectTimeout: 30000,
      commandTimeout: 20000,
      enableOfflineQueue: true,
      reconnectOnError(err) {
        const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED'];
        return targetErrors.some(e => err.message.includes(e));
      },
      tls: {
        rejectUnauthorized: false,
        servername: host
      },
      db: 0,
      family: 4,
      keepAlive: 30000,
      autoResubscribe: true,
      autoResendUnfulfilledCommands: true,
      lazyConnect: true,
      showFriendlyErrorStack: true
    });

    this.client.on('error', (error) => {
      this.logger.error(`Redis connection error: ${error.message}`);
    });

    this.client.on('connect', () => {
      this.logger.log('Successfully connected to Redis');
    });

    this.client.on('ready', () => {
      this.logger.log('Redis client is ready');
    });

    this.client.on('reconnecting', (delay) => {
      this.logger.log(`Reconnecting to Redis in ${delay}ms...`);
    });

    this.client.on('end', () => {
      this.logger.log('Redis connection ended');
    });

    RedisService.instance = this.client;

    // Add connection health check
    setInterval(async () => {
      try {
        const pong = await this.client.ping();
        if (pong !== 'PONG') {
          this.logger.error('Redis health check failed: unexpected response');
        }
      } catch (error) {
        this.logger.error(`Redis health check failed: ${error.message}`);
      }
    }, 30000);

    // Verify connection immediately
    try {
      await this.client.ping();
      this.logger.log('Initial Redis connection verified');
    } catch (error) {
      this.logger.error(`Failed to verify initial Redis connection: ${error.message}`);
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.client && !RedisService.instance) {
      await this.client.quit();
    }
  }

  private async ensureConnection<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      this.logger.error(`Redis operation failed: ${error.message}`);
      if (error.message.includes('ECONNRESET') || error.message.includes('not connected')) {
        // Wait a bit and try to reconnect
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await operation();
      }
      throw error;
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<'OK'> {
    this.logger.debug(`Setting Redis key: ${key} with TTL: ${ttl}`);
    return this.ensureConnection(async () => {
      if (ttl) {
        const result = await this.client.set(key, value, 'EX', ttl);
        this.logger.debug(`Set result for key ${key}: ${result}`);
        return result;
      }
      const result = await this.client.set(key, value);
      this.logger.debug(`Set result for key ${key}: ${result}`);
      return result;
    });
  }

  async get(key: string): Promise<string | null> {
    this.logger.debug(`Getting Redis key: ${key}`);
    return this.ensureConnection(async () => {
      const value = await this.client.get(key);
      this.logger.debug(`Get result for key ${key}: ${value}`);
      return value;
    });
  }

  async del(key: string): Promise<number> {
    this.logger.debug(`Deleting Redis key: ${key}`);
    return this.ensureConnection(async () => {
      const result = await this.client.del(key);
      this.logger.debug(`Delete result for key ${key}: ${result}`);
      return result;
    });
  }
}