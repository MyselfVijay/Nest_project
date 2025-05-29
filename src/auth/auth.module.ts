import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User, UserSchema } from '../schemas/user.schema';
import { HealthRecord, HealthRecordSchema } from '../schemas/health-record.schema';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PatientController } from './patient.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { DoctorModule } from '../doctor/doctor.module';
import { DoctorController } from './doctor.controller';
import { RedisService } from '../payment/redis.service';
import { MailerModule } from '@nestjs-modules/mailer';
import { GoogleStrategy } from './strategies/google.strategy';
import { FacebookStrategy } from './strategies/facebook.strategy';
import { RolesGuard } from './guards/roles.guard';
import { UserController } from './user.controller';
import { IdentifierAuthService } from './identifier-auth.service';
import { IdentifierAuthController } from './identifier-auth.controller';
import { Identifier, IdentifierSchema } from '../schemas/identifier.schema';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: HealthRecord.name, schema: HealthRecordSchema },
      { name: Identifier.name, schema: IdentifierSchema }
    ]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '1h' },
      }),
      inject: [ConfigService],
    }),
    DoctorModule,
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        transport: {
          host: configService.get('SMTP_HOST'),
          port: configService.get('SMTP_PORT'),
          secure: false,
          auth: {
            user: configService.get('SMTP_USER'),
            pass: configService.get('SMTP_PASS'),
          },
        },
        defaults: {
          from: configService.get('SMTP_FROM'),
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, PatientController, DoctorController, UserController, IdentifierAuthController],
  providers: [AuthService, JwtAuthGuard, JwtStrategy, RedisService, GoogleStrategy, FacebookStrategy, RolesGuard, IdentifierAuthService],
  exports: [AuthService, RolesGuard, IdentifierAuthService, RedisService]
})
export class AuthModule {}