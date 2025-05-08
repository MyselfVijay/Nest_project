import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { PatientModule } from './patient/patient.module';
import { DoctorModule } from './doctor/doctor.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    MongooseModule.forRoot('mongodb+srv://myselfvijay033:Vantan_da_420@cluster0.teza9si.mongodb.net/nestdb'),
    PatientModule,
    DoctorModule,
    AuthModule, // Add this line
  ],
})
export class AppModule {}
