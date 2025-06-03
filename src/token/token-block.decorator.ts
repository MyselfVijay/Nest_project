import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import { TokenBlockService } from './token-block.service';

export const BLOCK_TOKEN_KEY = 'block_token';
export const BlockToken = (data: { reason: string }) => SetMetadata(BLOCK_TOKEN_KEY, data);

export const BlockTokenHandler = createParamDecorator(
  async (data: { reason: string }, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest();
    const tokenBlockService = request.app.get(TokenBlockService);
    const token = request.headers.authorization?.split(' ')[1];

    if (token) {
      await tokenBlockService.blockToken(token, data.reason);
    }
  },
); 