import { Module } from '@nestjs/common';
import { HospitalDataController } from './hospital-data.controller';
import { DoctorService } from '../doctor/doctor.service';
import { DoctorModule } from '../doctor/doctor.module';

@Module({
  imports: [DoctorModule],
  controllers: [HospitalDataController],
  providers: [DoctorService]
})
export class HospitalDataModule {} 