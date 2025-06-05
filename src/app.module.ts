import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';
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
import { NotificationModule } from './notification/notification.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRoot(process.env.MONGODB_URI || 'mongodb://localhost:27017/hospital-management'),
    ScheduleModule.forRoot(),
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
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: HealthRecord.name, schema: HealthRecordSchema },
      { name: DoctorAvailability.name, schema: DoctorAvailabilitySchema },
      { name: Appointment.name, schema: AppointmentSchema }
    ]),
    AuthModule,
    PatientModule,
    PaymentModule,
    HospitalModule,
    TokenBlockModule,
    OtpModule,
    DoctorModule,
    NotificationModule
  ],
  providers: [TokenBlockService, RedisService],
  exports: [TokenBlockService, RedisService]
})
export class AppModule {}
