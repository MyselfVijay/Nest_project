import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from './auth/auth.module';
import { PatientModule } from './patient/patient.module';

@Module({
  imports: [
    MongooseModule.forRoot('mongodb://localhost:27017/hospital_db'),
    AuthModule,
    PatientModule
  ],
})
export class AppModule {}
