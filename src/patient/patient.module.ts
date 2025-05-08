import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '../schemas/user.schema';
import { AuthModule } from '../auth/auth.module';
import { PatientController } from './patient.controller';
import { PatientService } from './patient.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
    AuthModule  // Import AuthModule to make AuthService available
  ],
  controllers: [PatientController],
  providers: [PatientService]
})
export class PatientModule {}