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

@Controller('auth/doctors')
export class DoctorController {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(HealthRecord.name) private healthRecordModel: Model<HealthRecordDocument>,
    private authService: AuthService
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

  // Simple patients endpoint
  @Get('patients')
  @UseGuards(JwtAuthGuard, new RolesGuard(['doctor']))
  async getPatientsList(@Request() req) {
    const hospitalId = req.user.hospitalId;
    
    // Fetch all patients without filtering
    const patients = await this.userModel.find(
      { hospitalId: hospitalId, userType: 'patient' },
      { password: 0 }
    );
  
    return {
      message: 'Patients list retrieved successfully',
      data: patients
    };
  }

  // Advanced patients endpoint with filtering
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
    const hospitalId = req.user.hospitalId;
    console.log('here');
  
    // First, get all patients in the hospital
    const allPatients = await this.userModel.find(
      {  userType: 'patient' }    );
    console.log(allPatients.length);
  

    if (allPatients.length === 0) {
      return {
        message: 'No patients registered in this hospital.',
        data: []
      };
    }
  
    // Get all patient IDs
    const allPatientIds = allPatients.map(p => p._id);
  
    // Build base filter with hospital's patients
    const recordsFilter: any = { patientId: { $in: allPatientIds } };
  
    // Apply additional filters if provided
    if (patientName || patientId) {
      const patientFilter: any = { hospitalId, userType: 'patient' };
      if (patientName) {
        patientFilter.name = { $regex: patientName, $options: 'i' };
      }
      if (patientId) {
        patientFilter._id = patientId;
      }
  
      const filteredPatients = await this.userModel.find(patientFilter, { _id: 1 });
      if (filteredPatients.length === 0) {
        let message = 'No patients found';
        if (patientName) message += ` with name "${patientName}"`;
        if (patientId) message += ` with ID "${patientId}"`;
        message += '. Please verify the patient information.';
  
        return {
          message,
          data: []
        };
      }
      recordsFilter.patientId = { $in: filteredPatients.map(p => p._id) };
    }
  
    if (diagnosis) {
      recordsFilter.diagnosis = { $regex: diagnosis, $options: 'i' };
    }
  
    if (fromDate || toDate) {
      recordsFilter.visitDate = {};
      if (fromDate) recordsFilter.visitDate.$gte = new Date(fromDate);
      if (toDate) recordsFilter.visitDate.$lte = new Date(toDate);
    }
  
    // Get health records with full population
    const records = await this.healthRecordModel.find(recordsFilter)
      .populate('patientId', 'name email mobileNo')
      .populate('doctorId', 'name email')
      .sort({ visitDate: -1 });
  
    if (records.length === 0) {
      let message = 'No health records found';
      if (patientName || patientId) {
        message += ' for the specified patient';
        if (patientName) message += ` (name: "${patientName}")`;
        if (patientId) message += ` (ID: "${patientId}")`;
      }
      if (diagnosis) message += ` with diagnosis "${diagnosis}"`;
      if (fromDate && toDate) {
        message += ` between ${new Date(fromDate).toLocaleDateString()} and ${new Date(toDate).toLocaleDateString()}`;
      } else if (fromDate) {
        message += ` from ${new Date(fromDate).toLocaleDateString()}`;
      } else if (toDate) {
        message += ` until ${new Date(toDate).toLocaleDateString()}`;
      }
      message += '. Please verify your search criteria or try with different parameters.';
  
      return {
        message,
        data: [],
        status: 'NOT_FOUND',
        searchCriteria: {
          patientName,
          patientId,
          diagnosis,
          dateRange: { fromDate, toDate }
        }
      };
    }
  
    return {
      message: 'Hospital health records retrieved successfully',
      data: records
    };
  }

  @Get('patients/:patientId/health-records')
  @UseGuards(JwtAuthGuard, new RolesGuard(['doctor']))
  async getPatientHealthRecords(
    @Param('patientId') patientId: string,
    @Req() req: ExpressRequest & { user: { sub: string, hospitalId: string, userType: string } }
  ) {
    const hospitalId = req.user.hospitalId;
    const userType = req.user.userType;
  
    // Check if the user is a patient trying to access other patient's records
    if (userType === 'patient' && req.user.sub !== patientId) {
      throw new HttpException('Access denied. You can only view your own health records.', HttpStatus.FORBIDDEN);
    }
    
    // Verify patient exists and belongs to same hospital
    const patient = await this.userModel.findOne({
      _id: patientId,
      hospitalId: hospitalId,
      userType: 'patient'
    });
  
    if (!patient) {
      throw new HttpException('Patient not found in your hospital. Please verify the patient ID.', HttpStatus.NOT_FOUND);
    }
  
    const records = await this.healthRecordModel.find({ patientId })
      .populate('patientId', 'name email mobileNo')
      .populate('doctorId', 'name email')
      .sort({ visitDate: -1 });
  
    // Alert if no records found
    if (records.length === 0) {
      return {
        message: `No health records found for patient ${patient.name}.`,
        data: []
      };
    }
  
    return {
      message: 'Patient health records retrieved successfully',
      data: records
    };
  }

  @Post('patients/:patientId/health-records')
  @UseGuards(JwtAuthGuard, new RolesGuard(['doctor']))
  async createHealthRecord(
    @Param('patientId') patientId: string,
    @Body() createHealthRecordDto: CreateHealthRecordDto,
    @Request() req
  ) {
    const hospitalId = req.user.hospitalId;
    const doctorId = req.user.sub;
  
    // Verify patient exists and belongs to same hospital
    const patient = await this.userModel.findOne({
      _id: patientId,
      hospitalId: hospitalId,
      userType: 'patient'
    });
  
    if (!patient) {
      throw new HttpException(
        'Patient not found in your hospital. Please verify the patient ID.',
        HttpStatus.NOT_FOUND
      );
    }
  
    // Create new health record
    const newHealthRecord = new this.healthRecordModel({
      ...createHealthRecordDto,
      patientId: patientId,
      doctorId: doctorId,
      createdAt: new Date(),
      updatedAt: new Date()
    });
  
    try {
      const savedRecord = await newHealthRecord.save();
      
      // Populate the response with patient and doctor details
      const populatedRecord = await this.healthRecordModel.findById(savedRecord._id)
        .populate('patientId', 'name email mobileNo')
        .populate('doctorId', 'name email');
  
      return {
        message: 'Health record created successfully',
        data: populatedRecord
      };
    } catch (error) {
      if (error.name === 'ValidationError') {
        const validationError = error as { errors: { [key: string]: { message: string } } };
        throw new HttpException({
          message: 'Validation failed',
          errors: Object.values(validationError.errors).map(err => err.message)
        }, HttpStatus.BAD_REQUEST);
      }
      throw new InternalServerErrorException(
        'An error occurred while creating the health record. Please try again.'
      );
    }
  }
}