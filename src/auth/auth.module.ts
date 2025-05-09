import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { User, UserSchema } from '../schemas/user.schema';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { DoctorController } from './doctor.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PatientController } from './patient.controller';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
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
  providers: [AuthService, JwtAuthGuard],
  exports: [AuthService]
})
export class AuthModule {}