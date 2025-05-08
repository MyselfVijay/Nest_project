import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  async generateTokens(userId: Types.ObjectId | string, hospitalId: string, userType: string) {
    const payload = {
      sub: userId.toString(),
      hospitalId,
      userType,
      iat: Math.floor(Date.now() / 1000)
    };

    const accessToken = this.jwtService.sign(payload);
    const decodedToken = this.jwtService.decode(accessToken);

    return {
      accessToken,
      decodedToken
    };
  }

  async validateToken(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync(token);
      return payload;
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }

  decodeToken(token: string) {
    return this.jwtService.decode(token);
  }
}