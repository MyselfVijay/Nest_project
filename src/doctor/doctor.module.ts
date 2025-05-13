import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DoctorController } from './doctor.controller';
import { DoctorService } from './doctor.service';
import { User, UserSchema } from '../schemas/user.schema';
import { HealthRecord, HealthRecordSchema } from '../schemas/health-record.schema';
import { DoctorAvailability, DoctorAvailabilitySchema } from '../schemas/doctor-availability.schema';
import { Appointment, AppointmentSchema } from '../schemas/appointment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: HealthRecord.name, schema: HealthRecordSchema },
      { name: DoctorAvailability.name, schema: DoctorAvailabilitySchema },
      { name: Appointment.name, schema: AppointmentSchema }
    ]),
  ],
  controllers: [DoctorController],
  providers: [DoctorService],
  exports: [DoctorService]
})
export class DoctorModule {}