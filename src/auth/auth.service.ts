import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';

@Injectable()
export class AuthService {
  constructor(private jwtService: JwtService) {}

  async generateTokens(userId: Types.ObjectId, hospitalId: string, userType: string) {
    const payload = {
      sub: userId.toString(),
      hospitalId,
      userType
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        expiresIn: '15m',
        secret: 'your_access_token_secret'
      }),
      this.jwtService.signAsync(payload, {
        expiresIn: '7d',
        secret: 'your_refresh_token_secret'
      })
    ]);

    return {
      accessToken,
      refreshToken
    };
  }

  async validateToken(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: 'your_access_token_secret'
      });
      return {
        userId: new Types.ObjectId(payload.sub),
        hospitalId: payload.hospitalId,
        userType: payload.userType
      };
    } catch {
      return null;
    }
  }
}