import { Module } from '@nestjs/common';
import { OtpController } from './otp.controller';
import { TokenBlockModule } from '../token/token-block.module';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../schemas/user.schema';
import { RedisService } from '../payment/redis.service';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigService } from '@nestjs/config';

@Module({
  imports: [
    TokenBlockModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema }
    ]),
    MailerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: 'smtp.gmail.com',
          port: 587,
          secure: false,
          auth: {
            user: config.get('EMAIL_USER'),
            pass: config.get('EMAIL_PASSWORD')
          }
        }
      })
    })
  ],
  controllers: [OtpController],
  providers: [RedisService],
  exports: []
})
export class OtpModule {} 