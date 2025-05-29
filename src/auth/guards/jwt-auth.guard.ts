import { Injectable, ExecutionContext, UnauthorizedException, Inject } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // First, let the base AuthGuard handle the JWT authentication
    const result = (await super.canActivate(context)) as boolean;
    if (!result) {
      return false; // Authentication failed by the strategy
    }

    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
       // This case should ideally be caught by the base AuthGuard, 
       // but we keep a check here for safety.
       throw new UnauthorizedException('No token provided');
    }

    // Now, check if the token is blacklisted
    if (await this.authService.isTokenBlacklisted(token)) {
      throw new UnauthorizedException('Token has been invalidated');
    }

    return true; // Authentication successful and token is not blacklisted
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      if (info?.message === 'No auth token') {
        throw new UnauthorizedException('No authentication token provided');
      }
      if (info?.message === 'jwt expired') {
        throw new UnauthorizedException('Authentication token has expired');
      }
      throw new UnauthorizedException('Invalid authentication token');
    }
    return user;
  }
}