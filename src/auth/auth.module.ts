import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtModule } from '@nestjs/jwt';
import { User, UserSchema } from '../schemas/user.schema';
import { DoctorController } from './doctor.controller';
import { AuthService } from './auth.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    JwtModule.register({
      secret: 'your_jwt_secret',
      signOptions: { expiresIn: '15m' },
    }),
  ],
  controllers: [DoctorController],
  providers: [AuthService],
  exports: [AuthService]  // Export AuthService to make it available in other modules
})
export class AuthModule {}