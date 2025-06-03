import { Injectable, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from '../auth.service';

interface RouteInfo {
  path: string;
  method: string;
}

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);
  public excludeRoutes: RouteInfo[] = [];

  constructor(private readonly authService: AuthService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // Check if the route should be excluded
    const shouldExclude = this.excludeRoutes.some(
      route => 
        request.path.includes(route.path) && 
        request.method === route.method
    );

    if (shouldExclude) {
      return true;
    }

    try {
      // First, let the base AuthGuard handle the JWT authentication
      const result = (await super.canActivate(context)) as boolean;
      if (!result) {
        return false; // Authentication failed by the strategy
      }

      const token = this.extractTokenFromHeader(request);

      if (!token) {
        throw new UnauthorizedException('No token provided');
      }

      // Check if the token is blacklisted
      const isBlacklisted = await this.authService.isTokenBlacklisted(token);
      if (isBlacklisted) {
        this.logger.warn(`Blocked access attempt with blacklisted token`);
        throw new UnauthorizedException('Token has been invalidated');
      }

      return true;
    } catch (error) {
      this.logger.error(`Authentication error: ${error.message}`, error.stack);
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Authentication failed');
    }
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