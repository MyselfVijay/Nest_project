import { Module } from '@nestjs/common';
import { TokenBlockService } from './token-block.service';
import { TokenBlockGuard } from './token-block.guard';
import { TokenBlockFilter } from './token-block.filter';
import { RedisService } from '../payment/redis.service';

@Module({
  providers: [TokenBlockService, TokenBlockGuard, TokenBlockFilter, RedisService],
  exports: [TokenBlockService, TokenBlockGuard, TokenBlockFilter]
})
export class TokenBlockModule {} 