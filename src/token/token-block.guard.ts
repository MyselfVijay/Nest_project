import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { TokenBlockService } from './token-block.service';
import { Reflector } from '@nestjs/core';
import { BLOCK_TOKEN_KEY } from './token-block.decorator';

@Injectable()
export class TokenBlockGuard implements CanActivate {
  constructor(
    private readonly tokenBlockService: TokenBlockService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      return true; // Let other guards handle authentication
    }

    const blockStatus = await this.tokenBlockService.isTokenBlocked(token);
    
    if (blockStatus.blocked) {
      throw new ForbiddenException({
        message: 'Access temporarily blocked',
        reason: blockStatus.reason,
        expiresAt: blockStatus.expiresAt
      });
    }

    // Get the block token metadata
    const blockTokenData = this.reflector.get(BLOCK_TOKEN_KEY, context.getHandler());
    
    if (blockTokenData) {
      // If there's a ForbiddenException, block the token
      try {
        return true;
      } catch (error) {
        if (error instanceof ForbiddenException) {
          await this.tokenBlockService.blockToken(token, blockTokenData.reason);
        }
        throw error;
      }
    }

    return true;
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
} 