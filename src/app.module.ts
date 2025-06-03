import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import { User, UserSchema } from './schemas/user.schema';
import { HealthRecord, HealthRecordSchema } from './schemas/health-record.schema';
import { DoctorAvailability, DoctorAvailabilitySchema } from './schemas/doctor-availability.schema';
import { Appointment, AppointmentSchema } from './schemas/appointment.schema';
import { MailerModule } from '@nestjs-modules/mailer';
import { PatientModule } from './patient/patient.module';
import { PaymentModule } from './payment/payment.module';
import { HospitalModule } from './hospital/hospital.module';
import { TokenBlockModule } from './token/token-block.module';
import { OtpModule } from './auth/otp.module';
import { TokenBlockService } from './token/token-block.service';
import { RedisService } from './payment/redis.service';
import { DoctorModule } from './doctor/doctor.module';

@Module({
  imports: [
    // Remove RedisModule.forRoot() configuration
    ConfigModule.forRoot({
      isGlobal: true  // Make ConfigModule globally available
    }),
    MongooseModule.forRoot(process.env.MONGODB_URI || 'mongodb://localhost:27017/hospital-management'),
    AuthModule,
    PatientModule,
    HospitalModule,
    TokenBlockModule,
    OtpModule,
    DoctorModule,
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: HealthRecord.name, schema: HealthRecordSchema },
      { name: DoctorAvailability.name, schema: DoctorAvailabilitySchema },
      { name: Appointment.name, schema: AppointmentSchema }
    ]),
    MailerModule.forRoot({
      transport: {
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD
        }
      }
    }),
    PaymentModule,
  ],
  providers: [
    TokenBlockService,
    RedisService
  ],
  exports: [TokenBlockService, RedisService]
})
export class AppModule {}
