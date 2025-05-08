import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/user.entity';

@Injectable()
export class PatientService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>
  ) {}

  async create(createPatientDto: any) {
    const createdPatient = new this.userModel({
      ...createPatientDto,
      userType: 'patient'
    });
    return createdPatient.save();
  }

  async findAll() {
    return this.userModel.find({ userType: 'patient' }).exec();
  }

  async findOne(id: string) {
    const patient = await this.userModel.findById(id).exec();
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    return patient;
  }

  async update(id: string, updatePatientDto: any) {
    const updatedPatient = await this.userModel
      .findByIdAndUpdate(id, updatePatientDto, { new: true })
      .exec();
    if (!updatedPatient) {
      throw new NotFoundException('Patient not found');
    }
    return updatedPatient;
  }

  async remove(id: string) {
    const deletedPatient = await this.userModel
      .findByIdAndDelete(id)
      .exec();
    if (!deletedPatient) {
      throw new NotFoundException('Patient not found');
    }
    return deletedPatient;
  }
}