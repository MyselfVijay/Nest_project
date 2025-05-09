import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
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