import { Injectable, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Hospital } from './hospital.entity';
import { CreateHospitalDto } from './dto/create-hospital.dto';

@Injectable()
export class HospitalService {
  constructor(
    @InjectModel(Hospital.name) private hospitalModel: Model<Hospital>,
  ) {}

  async create(createHospitalDto: CreateHospitalDto) {
    try {
      const existingHospital = await this.hospitalModel.findOne({ 
        hospitalId: createHospitalDto.hospitalId 
      });
      
      if (existingHospital) {
        throw new ConflictException('Hospital ID already exists');
      }

      const hospital = new this.hospitalModel(createHospitalDto);
      return await hospital.save();
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      throw error;
    }
  }

  async findAll() {
    return this.hospitalModel.find().exec();
  }
}