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
  @UseGuards(JwtAuthGuard, new RolesGuard(['doctor']))
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

  @Post('patients/:patientId/health-records')
  @UseGuards(JwtAuthGuard, new RolesGuard(['doctor']))
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

  @Get('patients/health-records/:patientId')
  @UseGuards(JwtAuthGuard, new RolesGuard(['doctor']))
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

  @Get('hospital-patients')
  @UseGuards(JwtAuthGuard, new RolesGuard(['doctor']))
  async getHospitalPatients(
    @Request() req,
    @Query('name') name?: string,
    @Query('email') email?: string,
    @Query('patientId') patientId?: string
  ) {
    const hospitalId = req.user.hospitalId;
    
    // Build filter query
    const filter: any = { hospitalId, userType: 'patient' };
    
    if (name) {
      filter.name = { $regex: name, $options: 'i' };
    }
    if (email) {
      filter.email = { $regex: email, $options: 'i' };
    }
    if (patientId) {
      filter._id = patientId;
    }
  
    // Fetch filtered patients with specific field selection
    const patients = await this.userModel.find(
      filter,
      { password: 0 }
    ).select('name email mobileNo createdAt');
  
    // Detailed error message
    if (patients.length === 0) {
      let message = 'No patients found';
      if (name) message += ` with name "${name}"`;
      if (email) message += ` with email "${email}"`;
      if (patientId) message += ` with ID "${patientId}"`;
      message += '. Please verify the search criteria.';
  
      return {
        message,
        data: []
      };
    }
  
    return {
      message: 'Hospital patients retrieved successfully',
      data: patients
    };
  }

  @Get('hospital-health-records')
  @UseGuards(JwtAuthGuard, new RolesGuard(['doctor']))
  async getHospitalHealthRecords(
    @Request() req,
    @Query('patientName') patientName?: string,
    @Query('patientId') patientId?: string,
    @Query('diagnosis') diagnosis?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string
  ) {
    const records = await this.doctorService.getHospitalHealthRecords(
      req.user.hospitalId,
      { patientName, patientId, diagnosis, fromDate, toDate }
    );
  
    return {
      message: records.length > 0 
        ? 'Hospital health records retrieved successfully'
        : 'No health records found in the hospital',
      data: records
    };
  }

  @Get('patients/:patientId/health-records')
  @UseGuards(JwtAuthGuard, new RolesGuard(['doctor']))
  async getPatientHealthRecords(
    @Param('patientId') patientId: string,
    @Req() req: ExpressRequest & { user: { sub: string, hospitalId: string } }
  ) {
    const records = await this.doctorService.getPatientHealthRecords(
      patientId,
      req.user.hospitalId
    );
  
    return {
      message: 'Patient health records retrieved successfully',
      data: records
    };
  }

  @Get('hospital-patients')
  @UseGuards(JwtAuthGuard, new RolesGuard(['doctor']))
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
  
    if (patients.length === 0) {
      let message = 'No patients found';
      if (name) message += ` with name "${name}"`;
      if (email) message += ` with email "${email}"`;
      if (patientId) message += ` with ID "${patientId}"`;
      message += '. Please verify the search criteria.';
  
      return { message, data: [] };
    }
  
    return {
      message: 'Hospital patients retrieved successfully',
      data: patients
    };
  }
}