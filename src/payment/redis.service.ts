import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  async onModuleInit() {
    const host = process.env.REDIS_HOST;
    const port = process.env.REDIS_PORT;
    const password = process.env.REDIS_PASSWORD;

    if (!host || !port || !password) {
      throw new Error('Redis configuration is incomplete. Please check environment variables.');
    }

    this.client = new Redis({
      host,
      port: parseInt(port, 10),
      password,
      retryStrategy(times) {
        const maxRetryDelay = 3000;
        const delay = Math.min(times * 100, maxRetryDelay);
        return delay;
      },
      maxRetriesPerRequest: 5,
      connectTimeout: 20000,
      commandTimeout: 10000,
      enableOfflineQueue: true,
      reconnectOnError(err) {
        const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
        return targetErrors.some(e => err.message.includes(e));
      },
      tls: {
        rejectUnauthorized: false,
        servername: host
      },
      db: 0,
      family: 4,
      keepAlive: 10000,
      autoResubscribe: true,
      autoResendUnfulfilledCommands: true,
      lazyConnect: false,
      showFriendlyErrorStack: true
    });

    this.client.on('error', (error) => {
      console.error('Redis connection error:', error);
    });

    this.client.on('connect', () => {
      console.log('Successfully connected to Redis');
    });

    this.client.on('ready', () => {
      console.log('Redis client is ready');
    });

    this.client.on('reconnecting', (delay) => {
      console.log(`Reconnecting to Redis in ${delay}ms...`);
    });

    this.client.on('end', () => {
      console.log('Redis connection ended');
    });

    // Add connection health check
    setInterval(async () => {
      try {
        const pong = await this.client.ping();
        if (pong !== 'PONG') {
          console.error('Redis health check failed: unexpected response');
        }
      } catch (error) {
        console.error('Redis health check failed:', error);
      }
    }, 30000);
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.quit();
    }
  }

  private async ensureConnection<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error.message.includes('ECONNRESET') || error.message.includes('not connected')) {
        // Wait a bit and try to reconnect
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await operation();
      }
      throw error;
    }
  }

  async set(key: string, value: string, ttl?: number): Promise<'OK'> {
    return this.ensureConnection(async () => {
      if (ttl) {
        return this.client.set(key, value, 'EX', ttl);
      }
      return this.client.set(key, value);
    });
  }

  async get(key: string): Promise<string | null> {
    return this.ensureConnection(() => this.client.get(key));
  }

  async del(key: string): Promise<number> {
    return this.ensureConnection(() => this.client.del(key));
  }
}