import { Controller, Post, Body, HttpStatus, HttpException, Headers, InternalServerErrorException, Param, Req } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import { CreateDoctorDto } from '../doctor/dto/create-doctor.dto';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UseGuards, Get, Request, Query } from '@nestjs/common';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { CreateHealthRecordDto } from '../patient/dto/create-health-record.dto';
import { HealthRecord, HealthRecordDocument } from '../schemas/health-record.schema';
import { Request as ExpressRequest } from 'express';
import { DoctorService } from '../doctor/doctor.service';
import { Roles } from './decorators/roles.decorator';

@Controller('auth/doctors')
export class DoctorController {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(HealthRecord.name) private healthRecordModel: Model<HealthRecordDocument>,
    private authService: AuthService,
    private doctorService: DoctorService
  ) {}

  @Post('register')
  async register(@Body() createDoctorDto: CreateDoctorDto, @Headers('hospital-id') hospitalId: string) {
    try {
      // Validate hospital ID
      if (!hospitalId) {
        throw new HttpException('Hospital ID is required', HttpStatus.BAD_REQUEST);
      }

      // Check if user already exists
      const existingUser = await this.userModel.findOne({ email: createDoctorDto.email });
      if (existingUser) {
        throw new HttpException('Email already registered', HttpStatus.CONFLICT);
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(createDoctorDto.password, 10);

      // Create new doctor with all required fields
      const newDoctor = new this.userModel({
        name: createDoctorDto.name,
        email: createDoctorDto.email.toLowerCase(),
        password: hashedPassword,
        mobileNo: createDoctorDto.mobileNo,
        hospitalId: hospitalId,
        userType: 'doctor',
        createdAt: new Date(),
        lastLogin: null
      });

      // Log the doctor object before saving (excluding sensitive data)
      console.log('Attempting to save doctor:', {
        name: newDoctor.name,
        email: newDoctor.email,
        mobileNo: newDoctor.mobileNo,
        hospitalId: newDoctor.hospitalId,
        userType: newDoctor.userType
      });

      // Save doctor with proper type assertion
      const savedDoctor = await newDoctor.save();

      // Generate tokens with proper type handling
      const tokens = await this.authService.generateTokens(
        (savedDoctor._id as ObjectId).toString(),
        savedDoctor.hospitalId,
        'doctor'
      );

      return {
        message: 'Doctor registered successfully',
        data: {
          userId: savedDoctor._id,
          name: savedDoctor.name,
          email: savedDoctor.email,
          mobileNo: savedDoctor.mobileNo,
          userType: savedDoctor.userType,
          hospitalId: savedDoctor.hospitalId,
          accessToken: tokens.accessToken
        }
      };
    } catch (error) {
      // Log the detailed error
      console.error('Doctor registration error:', error);

      if (error instanceof HttpException) {
        throw error;
      }

      // Type assertion for mongoose validation error
      if (error.name === 'ValidationError') {
        const validationError = error as { errors: { [key: string]: { message: string } } };
        throw new HttpException({
          message: 'Validation failed',
          errors: Object.values(validationError.errors).map(err => err.message)
        }, HttpStatus.BAD_REQUEST);
      }

      throw new InternalServerErrorException(
        'An error occurred while registering the doctor. Please try again.'
      );
    }
  }

  @Get('patients')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('doctor')
  async getPatientsList(@Request() req) {
    const hospitalId = req.user.hospitalId;
    
    // Fetch patients from the same hospital
    const patients = await this.userModel.find(
      { hospitalId: hospitalId, userType: 'patient' },
      { password: 0 } // Exclude password field
    );

    return {
      message: 'Patients list retrieved successfully',
      data: patients
    };
  }

  @Get('hospital-patients')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('doctor')
  async getHospitalPatients(
    @Request() req,
    @Query('name') name?: string,
    @Query('email') email?: string,
    @Query('patientId') patientId?: string
  ) {
    const patients = await this.doctorService.getHospitalPatients(
      req.user.hospitalId,
      { name, email, patientId }
    );
    return {
      message: "Hospital patient's list retrieved successfully",
      data: patients
    };
  }

  @Get('hospital-health-records')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('doctor')
  async getHospitalHealthRecords(
    @Request() req,
    @Query() filters: {
      patientName?: string,
      patientId?: string,
      diagnosis?: string,
      fromDate?: string,
      toDate?: string
    }
  ) {
    const records = await this.doctorService.getHospitalHealthRecords(
      req.user.hospitalId,
      filters
    );
    return {
      message: 'Hospital health records retrieved successfully',
      data: records
    };
  }

  @Get('patients/health-records/:patientId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('doctor')
  async getPatientHealthRecords(
    @Param('patientId') patientId: string,
    @Req() req: ExpressRequest & { user: { sub: string, hospitalId: string } }
  ) {
    const hospitalId = req.user.hospitalId;
    
    // Verify patient exists and belongs to same hospital
    const patient = await this.userModel.findOne({
      _id: patientId,
      hospitalId: hospitalId,
      userType: 'patient'
    });

    if (!patient) {
      throw new HttpException('Patient not found', HttpStatus.NOT_FOUND);
    }

    const records = await this.healthRecordModel.find({ patientId })
      .populate('doctorId', 'name')
      .sort({ visitDate: -1 });

    return {
      message: 'Patient health records retrieved successfully',
      data: records
    };
  }

  @Post('patients/:patientId/health-records')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('doctor')
  async createHealthRecord(
    @Param('patientId') patientId: string,
    @Body() createHealthRecordDto: CreateHealthRecordDto,
    @Req() req: ExpressRequest & { user: { sub: string, hospitalId: string } }
  ) {
    const doctorId = req.user.sub;
    const hospitalId = req.user.hospitalId;

    // Verify patient exists and belongs to same hospital
    const patient = await this.userModel.findOne({
      _id: patientId,
      hospitalId: hospitalId,
      userType: 'patient'
    });

    if (!patient) {
      throw new HttpException('Patient not found', HttpStatus.NOT_FOUND);
    }

    const healthRecord = new this.healthRecordModel({
      ...createHealthRecordDto,
      patientId,
      doctorId,
      hospitalId
    });

    const savedRecord = await healthRecord.save();

    return {
      message: 'Health record created successfully',
      data: savedRecord
    };
  }

  @Get('available')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('doctor', 'patient')
  async getAvailableDoctors(
    @Request() req,
    @Query('date') dateStr: string
  ) {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      throw new HttpException('Invalid date format', HttpStatus.BAD_REQUEST);
    }

    const doctors = await this.doctorService.getAvailableDoctors(req.user.hospitalId, date);
    
    return {
      message: 'Available doctors retrieved successfully',
      data: doctors
    };
  }

  @Post('availability')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('doctor')
  async setAvailability(
    @Req() req: ExpressRequest & { user: { sub: string, hospitalId: string } },
    @Body() availabilityDto: { fromTime: string; toTime: string }
  ) {
    const fromTime = new Date(availabilityDto.fromTime);
    const toTime = new Date(availabilityDto.toTime);

    if (isNaN(fromTime.getTime()) || isNaN(toTime.getTime())) {
      throw new HttpException('Invalid date format', HttpStatus.BAD_REQUEST);
    }

    const availability = await this.doctorService.setDoctorAvailability(
      req.user.sub,
      req.user.hospitalId,
      fromTime,
      toTime
    );

    return {
      message: 'Availability set successfully',
      data: availability
    };
  }
}