import { ExceptionFilter, Catch, ArgumentsHost, ForbiddenException, Logger } from '@nestjs/common';
import { Response } from 'express';
import { TokenBlockService } from './token-block.service';

interface BlockStatus {
  blocked: boolean;
  reason?: string;
  expiresAt?: string;
}

@Catch(ForbiddenException)
export class TokenBlockFilter implements ExceptionFilter {
  private readonly logger = new Logger(TokenBlockFilter.name);

  constructor(private readonly tokenBlockService: TokenBlockService) {}

  async catch(exception: ForbiddenException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();
    const token = request.headers.authorization?.split(' ')[1];

    this.logger.debug(`Processing ForbiddenException for path: ${request.path}`);

    // Check if token is already blocked
    const blockStatus: BlockStatus = token ? await this.tokenBlockService.isTokenBlocked(token) : { blocked: false };
    const retryCount = token ? await this.tokenBlockService.getRetryCount(token) : 0;
    const maxRetries = this.tokenBlockService.MAX_RETRIES;

    if (blockStatus.blocked && blockStatus.expiresAt) {
      // If token is already blocked, return the block status
      this.logger.warn(`Access attempt with blocked token to path: ${request.path}`);
      response.status(403).json({
        message: 'Access temporarily blocked',
        reason: blockStatus.reason,
        expiresAt: blockStatus.expiresAt,
        statusCode: 403,
        path: request.path,
        details: {
          blockDuration: '15 minutes',
          remainingTime: this.calculateRemainingTime(blockStatus.expiresAt),
          violationCount: retryCount,
          nextAllowedAttempt: blockStatus.expiresAt
        }
      });
    } else {
      // If token is not blocked, return warning message
      this.logger.warn(`Unauthorized access attempt to path: ${request.path}`);
      const remainingAttempts = maxRetries - retryCount;
      
      response.status(403).json({
        message: 'Forbidden resource',
        warning: remainingAttempts > 0 
          ? `This resource cannot be accessed. ${remainingAttempts} more attempt(s) before temporary blocking.`
          : 'This resource cannot be accessed. Next attempt will result in temporary token blocking.',
        error: 'Forbidden',
        statusCode: 403,
        path: request.path,
        details: {
          accessType: this.determineAccessType(request.path),
          remainingAttempts,
          nextBlockDuration: this.getNextBlockDuration(retryCount),
          cooldownPeriod: '5 minutes',
          resourceRestrictions: this.getResourceRestrictions(request.path)
        }
      });
    }
  }

  private calculateRemainingTime(expiresAt: string): string {
    const now = new Date();
    const expiry = new Date(expiresAt);
    const diff = expiry.getTime() - now.getTime();
    const minutes = Math.ceil(diff / (1000 * 60));
    return `${minutes} minutes`;
  }

  private determineAccessType(path: string): string {
    if (path.includes('/doctors/')) return 'Doctor-only access';
    if (path.includes('/patients/')) return 'Patient-only access';
    if (path.includes('/admin/')) return 'Admin-only access';
    return 'Restricted access';
  }

  private getNextBlockDuration(retryCount: number): string {
    return retryCount >= 2 ? '15 minutes' : '5 minutes';
  }

  private getResourceRestrictions(path: string): string[] {
    const restrictions: string[] = [];
    
    if (path.includes('/doctors/')) {
      restrictions.push('Only doctors can access this resource');
      restrictions.push('Must be associated with the correct hospital');
    }
    if (path.includes('/patients/')) {
      restrictions.push('Only patients can access this resource');
      restrictions.push('Can only access own records');
    }
    if (path.includes('/admin/')) {
      restrictions.push('Only administrators can access this resource');
    }
    
    return restrictions;
  }
} 