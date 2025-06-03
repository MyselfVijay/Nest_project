import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../payment/redis.service';

@Injectable()
export class TokenBlockService {
  private readonly BLOCK_PREFIX = 'token_block:';
  private readonly RETRY_PREFIX = 'token_retry:';
  private readonly INITIAL_BLOCK_DURATION = 5 * 60; // 5 minutes in seconds
  public readonly MAX_RETRIES = 3;
  private readonly EXTENDED_BLOCK_DURATION = 15 * 60; // 15 minutes in seconds

  constructor(private readonly redisService: RedisService) {}

  async blockToken(token: string, reason: string): Promise<void> {
    const blockKey = this.BLOCK_PREFIX + token;
    const retryKey = this.RETRY_PREFIX + token;

    // Get current retry count
    const retryCount = await this.getRetryCount(token);
    const blockDuration = retryCount >= this.MAX_RETRIES 
      ? this.EXTENDED_BLOCK_DURATION 
      : this.INITIAL_BLOCK_DURATION;

    // Store block information
    await this.redisService.set(
      blockKey,
      JSON.stringify({
        reason,
        blockedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + blockDuration * 1000).toISOString(),
        retryCount
      }),
      blockDuration
    );

    // Increment retry count
    await this.redisService.set(
      retryKey,
      (retryCount + 1).toString(),
      blockDuration
    );
  }

  async isTokenBlocked(token: string): Promise<{ blocked: boolean; reason?: string; expiresAt?: string }> {
    const blockKey = this.BLOCK_PREFIX + token;
    const blockInfo = await this.redisService.get(blockKey);

    if (!blockInfo) {
      return { blocked: false };
    }

    const { reason, expiresAt } = JSON.parse(blockInfo);
    return {
      blocked: true,
      reason,
      expiresAt
    };
  }

  async getRetryCount(token: string): Promise<number> {
    const retryKey = this.RETRY_PREFIX + token;
    const retryCount = await this.redisService.get(retryKey);
    return retryCount ? parseInt(retryCount, 10) : 0;
  }

  async clearBlock(token: string): Promise<void> {
    const blockKey = this.BLOCK_PREFIX + token;
    const retryKey = this.RETRY_PREFIX + token;
    await Promise.all([
      this.redisService.del(blockKey),
      this.redisService.del(retryKey)
    ]);
  }
} 