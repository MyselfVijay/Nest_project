import { Injectable, ConflictException, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../schemas/user.schema';
import { HealthRecord } from '../schemas/health-record.schema';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class DoctorService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(HealthRecord.name) private healthRecordModel: Model<HealthRecord>
  ) {}

  async create(createDoctorDto: CreateDoctorDto, hospitalId: string) {
    try {
      // Validate hospital ID
      if (!hospitalId) {
        throw new BadRequestException('Hospital ID is required');
      }

      // Check if email already exists
      const existingUser = await this.userModel.findOne({ email: createDoctorDto.email });
      if (existingUser) {
        throw new ConflictException('Email already exists');
      }

      const hashedPassword = await bcrypt.hash(createDoctorDto.password, 10);
      const doctor = new this.userModel({
        name: createDoctorDto.name,
        email: createDoctorDto.email.toLowerCase(),
        password: hashedPassword,
        userType: 'doctor',
        hospitalId,
      });

      await doctor.save();
      return {
        message: 'Doctor signup successful',
        data: {
          id: doctor._id,
          name: doctor.name,
          email: doctor.email,
          mobileNo: doctor.mobileNo
        }
      };
    } catch (error) {
      if (error instanceof ConflictException || error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error creating doctor:', error);
      throw new InternalServerErrorException('Failed to create doctor account');
    }
  }

  async update(id: string, updateDoctorDto: UpdateDoctorDto, hospitalId: string) {
    try {
      // Validate inputs
      if (!id || !hospitalId) {
        throw new BadRequestException('Doctor ID and Hospital ID are required');
      }

      // Validate MongoDB ObjectId
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new BadRequestException('Invalid doctor ID format');
      }

      if (updateDoctorDto.email) {
        const existingUser = await this.userModel.findOne({ 
          email: updateDoctorDto.email.toLowerCase(),
          _id: { $ne: id }
        });
        if (existingUser) {
          throw new ConflictException('Email already exists');
        }
        updateDoctorDto.email = updateDoctorDto.email.toLowerCase();
      }

      if (updateDoctorDto.password) {
        updateDoctorDto.password = await bcrypt.hash(updateDoctorDto.password, 10);
      }

      const doctor = await this.userModel.findOneAndUpdate(
        { _id: id, userType: 'doctor', hospitalId },
        updateDoctorDto,
        { new: true }
      );

      if (!doctor) {
        throw new NotFoundException('Doctor not found');
      }

      return {
        message: 'Doctor updated successfully',
        data: {
          name: doctor.name,
          email: doctor.email
        }
      };
    } catch (error) {
      if (error instanceof ConflictException || 
          error instanceof BadRequestException || 
          error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error updating doctor:', error);
      throw new InternalServerErrorException('Failed to update doctor account');
    }
  }

  async remove(id: string, hospitalId: string) {
    try {
      // Validate inputs
      if (!id || !hospitalId) {
        throw new BadRequestException('Doctor ID and Hospital ID are required');
      }

      // Validate MongoDB ObjectId
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new BadRequestException('Invalid doctor ID format');
      }

      const doctor = await this.userModel.findOneAndDelete({
        _id: id,
        userType: 'doctor',
        hospitalId
      });

      if (!doctor) {
        throw new NotFoundException('Doctor not found');
      }

      return { message: 'Doctor deleted successfully' };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error deleting doctor:', error);
      throw new InternalServerErrorException('Failed to delete doctor account');
    }
  }

  async getHospitalHealthRecords(hospitalId: string, filters: {
    patientName?: string,
    patientId?: string,
    diagnosis?: string,
    fromDate?: string,
    toDate?: string
  }) {
    const recordsFilter: any = { hospitalId };
    
    if (filters.patientId) {
      recordsFilter.patientId = filters.patientId;
    }
    if (filters.diagnosis) {
      recordsFilter.diagnosis = { $regex: filters.diagnosis, $options: 'i' };
    }
    if (filters.fromDate || filters.toDate) {
      recordsFilter.visitDate = {};
      if (filters.fromDate) recordsFilter.visitDate.$gte = new Date(filters.fromDate);
      if (filters.toDate) recordsFilter.visitDate.$lte = new Date(filters.toDate);
    }

    let records = await this.healthRecordModel.find(recordsFilter)
      .populate('patientId', 'name email mobileNo')
      .populate('doctorId', 'name email')
      .sort({ visitDate: -1 });

    if (filters.patientName) {
      records = records.filter(record => 
        (record.patientId as any).name?.toLowerCase().includes(filters.patientName!.toLowerCase())
      );
    }

    return records;
  }

  async getPatientHealthRecords(patientId: string, hospitalId: string) {
    const patient = await this.userModel.findOne({
      _id: patientId,
      hospitalId,
      userType: 'patient'
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    return this.healthRecordModel.find({ patientId })
      .populate('doctorId', 'name')
      .sort({ visitDate: -1 });
  }

  async getHospitalPatients(hospitalId: string, filters: {
    name?: string,
    email?: string,
    patientId?: string
  }) {
    const filter: any = { hospitalId, userType: 'patient' };
    
    if (filters.name) {
      filter.name = { $regex: filters.name, $options: 'i' };
    }
    if (filters.email) {
      filter.email = { $regex: filters.email, $options: 'i' };
    }
    if (filters.patientId) {
      filter._id = filters.patientId;
    }

    return this.userModel.find(
      filter,
      { password: 0 }
    ).select('name email mobileNo createdAt');
  }
}