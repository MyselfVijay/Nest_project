import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { User, UserSchema } from '../schemas/user.schema';
import { HealthRecord, HealthRecordSchema } from '../schemas/health-record.schema';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DoctorController } from './doctor.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PatientController } from './patient.controller';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: HealthRecord.name, schema: HealthRecordSchema }
    ]),
    JwtModule.registerAsync({
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { 
          expiresIn: configService.get<string>('JWT_EXPIRATION') 
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController, DoctorController, PatientController],
  providers: [AuthService, JwtAuthGuard, JwtStrategy],
  exports: [AuthService]
})
export class AuthModule {}