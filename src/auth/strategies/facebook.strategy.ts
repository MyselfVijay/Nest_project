import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-facebook';

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor() {
    // Add type checking for environment variables
    if (!process.env.FACEBOOK_APP_ID || !process.env.FACEBOOK_APP_SECRET || !process.env.FACEBOOK_CALLBACK_URL) {
      throw new Error('Facebook OAuth configuration is missing');
    }

    super({
      clientID: process.env.FACEBOOK_APP_ID,
      clientSecret: process.env.FACEBOOK_APP_SECRET,
      callbackURL: process.env.FACEBOOK_CALLBACK_URL,
      scope: 'email',
      profileFields: ['emails', 'name']
    });
  }

  async validate(accessToken: string, refreshToken: string, profile: any) {
    const { emails, name } = profile;
    
    if (!emails?.[0]?.value || !name?.givenName || !name?.familyName) {
      throw new Error('Incomplete profile information from Facebook');
    }

    return {
      email: emails[0].value,
      firstName: name.givenName,
      lastName: name.familyName
    };
  }
}