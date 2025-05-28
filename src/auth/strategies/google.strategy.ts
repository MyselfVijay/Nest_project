import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-google-oauth20';
import { Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    // Add type checking for environment variables
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_CALLBACK_URL) {
      throw new Error('Google OAuth configuration is missing');
    }

    super({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.GOOGLE_CALLBACK_URL,
      scope: ['email', 'profile']
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
  ): Promise<any> {
    try {
      // Log the profile for debugging
      console.log('Google Profile:', JSON.stringify(profile, null, 2));

      if (!profile || !profile._json) {
        throw new UnauthorizedException('Invalid profile received from Google');
      }

      const { email, given_name, family_name, picture } = profile._json;

      if (!email) {
        throw new UnauthorizedException('Email not found in Google profile');
      }

      const user = {
        email,
        firstName: given_name || '',
        lastName: family_name || '',
        picture: picture || '',
        accessToken,
      };

      return user;
    } catch (error) {
      console.error('Google authentication error:', error);
      throw new UnauthorizedException(error.message || 'Failed to authenticate with Google');
    }
  }
}