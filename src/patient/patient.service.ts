import { Injectable, ConflictException, NotFoundException, BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/user.entity';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class PatientService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
  ) {}

  async create(createPatientDto: CreatePatientDto, hospitalId: string) {
    try {
      if (!hospitalId) {
        throw new BadRequestException('Hospital ID is required');
      }

      // Check if email already exists (case-insensitive)
      const existingUser = await this.userModel.findOne({ 
        email: createPatientDto.email.toLowerCase() 
      });
      if (existingUser) {
        throw new ConflictException('Email already exists');
      }

      // Validate date format
      const date = new Date(createPatientDto.dob);
      if (isNaN(date.getTime())) {
        throw new BadRequestException('Invalid date format. Please use YYYY-MM-DD');
      }

      const hashedPassword = await bcrypt.hash(createPatientDto.password, 10);
      const patient = new this.userModel({
        name: createPatientDto.name,
        email: createPatientDto.email.toLowerCase(), // Store email in lowercase
        password: hashedPassword,
        mobileNo: createPatientDto.mobileNo,
        dob: date,
        userType: 'patient',
        hospitalId,
      });

      await patient.save();
      return {
        message: 'Patient signup successful',
        data: {
          name: patient.name,
          email: patient.email,
          mobileNo: patient.mobileNo,
          dob: patient.dob
        }
      };
    } catch (error) {
      if (error instanceof ConflictException || error instanceof BadRequestException) {
        throw error;
      }
      
      if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors).map((err: any) => err.message);
        throw new BadRequestException(messages);
      }

      console.error('Error creating patient:', error);
      throw error;
    }
  }

  async update(id: string, updatePatientDto: UpdatePatientDto, hospitalId: string) {
    try {
      if (!id || !hospitalId) {
        throw new BadRequestException('Patient ID and Hospital ID are required');
      }

      if (updatePatientDto.email) {
        const existingUser = await this.userModel.findOne({ 
          email: updatePatientDto.email.toLowerCase(),
          _id: { $ne: id }
        });
        if (existingUser) {
          throw new ConflictException('Email already exists');
        }
        updatePatientDto.email = updatePatientDto.email.toLowerCase();
      }

      if (updatePatientDto.password) {
        updatePatientDto.password = await bcrypt.hash(updatePatientDto.password, 10);
      }

      const patient = await this.userModel.findOneAndUpdate(
        { _id: id, userType: 'patient', hospitalId },
        updatePatientDto,
        { new: true }
      );

      if (!patient) {
        throw new NotFoundException('Patient not found');
      }

      return patient;
    } catch (error) {
      if (error instanceof ConflictException || 
          error instanceof BadRequestException || 
          error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error updating patient:', error);
      throw new InternalServerErrorException('Failed to update patient account');
    }
  }

  async remove(id: string, hospitalId: string) {
    try {
      // Validate inputs
      if (!id || !hospitalId) {
        throw new BadRequestException('Patient ID and Hospital ID are required');
      }

      // Validate MongoDB ObjectId
      if (!id.match(/^[0-9a-fA-F]{24}$/)) {
        throw new BadRequestException('Invalid patient ID format');
      }

      const patient = await this.userModel.findOneAndDelete({
        _id: id,
        userType: 'patient',
        hospitalId
      });

      if (!patient) {
        throw new NotFoundException('Patient not found');
      }

      return { message: 'Patient deleted successfully' };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error deleting patient:', error);
      throw new InternalServerErrorException('Failed to delete patient account');
    }
  }
}