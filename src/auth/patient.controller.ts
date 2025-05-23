import { Controller, Post, Get, Delete, Body, Param, HttpStatus, HttpException, Headers, Req } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import { CreatePatientDto } from '../patient/dto/create-patient.dto';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Request as ExpressRequest } from 'express';
import { HealthRecord, HealthRecordDocument } from '../schemas/health-record.schema';
import { DoctorService } from '../doctor/doctor.service';
import { Request } from '@nestjs/common';

@Controller('auth/patients')
export class PatientController {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(HealthRecord.name) private healthRecordModel: Model<HealthRecordDocument>,
    private authService: AuthService,
    private doctorService: DoctorService
  ) {}

  @Post('register')
  async register(@Body() createPatientDto: CreatePatientDto, @Headers('hospital-id') hospitalId: string) {
    try {
      // Validate hospital ID
      if (!hospitalId) {
        throw new HttpException('Hospital ID is required', HttpStatus.BAD_REQUEST);
      }

      // Check if user already exists
      const existingUser = await this.userModel.findOne({ email: createPatientDto.email });
      if (existingUser) {
        throw new HttpException('Email already registered', HttpStatus.CONFLICT);
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(createPatientDto.password, 10);

      // In the register method, update the newPatient creation:
      const newPatient = new this.userModel({
        name: createPatientDto.name,
        email: createPatientDto.email.toLowerCase(),
        password: hashedPassword,
        mobileNo: createPatientDto.mobileNo,
        hospitalId: hospitalId,
        userType: 'patient',
        dob: new Date(createPatientDto.dob),
        createdAt: new Date(),
        lastLogin: null
      });

      // Save patient
      const savedPatient = await newPatient.save();

      // Generate tokens
      const tokens = await this.authService.generateTokens(
        (savedPatient._id as Types.ObjectId).toString(),
        savedPatient.hospitalId,
        'patient'
      );

      return {
        message: 'Patient registered successfully',
        data: {
          userId: savedPatient._id,
          name: savedPatient.name,
          email: savedPatient.email,
          mobileNo: savedPatient.mobileNo,
          userType: savedPatient.userType,
          hospitalId: savedPatient.hospitalId,
          dob: createPatientDto.dob,
          accessToken: tokens.accessToken
        }
      };
    } catch (error) {
      console.error('Patient registration error:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      if (error.name === 'ValidationError') {
        const validationError = error as { errors: { [key: string]: { message: string } } };
        throw new HttpException({
          message: 'Validation failed',
          errors: Object.values(validationError.errors).map(err => err.message)
        }, HttpStatus.BAD_REQUEST);
      }

      throw new HttpException(
        'An error occurred while registering the patient',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get(':id')
  async getPatient(@Param('id') id: string) {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new HttpException('Invalid patient ID', HttpStatus.BAD_REQUEST);
      }

      const patient = await this.userModel.findOne({ _id: new Types.ObjectId(id), userType: 'patient' });
      if (!patient) {
        throw new HttpException('Patient not found', HttpStatus.NOT_FOUND);
      }

      // In the getPatient method response:
      return {
        message: 'Patient retrieved successfully',
        data: {
          userId: patient._id,
          name: patient.name,
          email: patient.email,
          mobileNo: patient.mobileNo,
          userType: patient.userType,
          hospitalId: patient.hospitalId,
          dob: patient.dob?.toISOString().split('T')[0] // Format as YYYY-MM-DD
        }
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'An error occurred while retrieving the patient',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Delete(':id')
  async deletePatient(@Param('id') id: string) {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new HttpException('Invalid patient ID', HttpStatus.BAD_REQUEST);
      }

      const patient = await this.userModel.findOneAndDelete({
        _id: new Types.ObjectId(id),
        userType: 'patient'
      });

      if (!patient) {
        throw new HttpException('Patient not found', HttpStatus.NOT_FOUND);
      }

      return {
        message: 'Patient deleted successfully',
        data: {
          userId: patient._id,
          name: patient.name,
          email: patient.email
        }
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'An error occurred while deleting the patient',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  } // Add closing brace here

  @Get('health-records')
  @UseGuards(JwtAuthGuard, new RolesGuard(['patient']))
  async getMyHealthRecords(@Req() req: ExpressRequest & { user: { sub: string } }) {
    const patientId = req.user.sub;
    
    const records = await this.healthRecordModel.find({ patientId })
      .populate('doctorId', 'name')
      .sort({ visitDate: -1 });
  
    return {
      message: 'Health records retrieved successfully',
      data: records
    };
  }

  @Post('appointments')
  @UseGuards(JwtAuthGuard, new RolesGuard(['patient']))
  async bookAppointment(
    @Request() req,
    @Body() bookingDto: { doctorId: string; appointmentTime: string }
  ) {
    const appointmentTime = new Date(bookingDto.appointmentTime);
    if (isNaN(appointmentTime.getTime())) {
      throw new HttpException('Invalid date format', HttpStatus.BAD_REQUEST);
    }

    const appointment = await this.doctorService.bookAppointment(
      bookingDto.doctorId,
      req.user.sub,
      req.user.hospitalId,
      appointmentTime.toISOString()
    );

    return {
      message: 'Appointment booked successfully',
      data: appointment
    };
  }
}