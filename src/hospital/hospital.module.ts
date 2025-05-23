import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HospitalController } from './hospital.controller';
import { HospitalService } from './hospital.service';
import { Hospital, HospitalSchema } from './hospital.entity';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Hospital.name, schema: HospitalSchema }
    ])
  ],
  controllers: [HospitalController],
  providers: [HospitalService],
  exports: [HospitalService]
})
export class HospitalModule {} 