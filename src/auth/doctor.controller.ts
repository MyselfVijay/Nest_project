import { Controller, Post, Body, HttpStatus, HttpException, Headers, InternalServerErrorException, Param, Req, Get, Query, UseGuards, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import { CreateDoctorDto } from '../doctor/dto/create-doctor.dto';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { CreateHealthRecordDto } from '../patient/dto/create-health-record.dto';
import { HealthRecord, HealthRecordDocument } from '../schemas/health-record.schema';
import { Request as ExpressRequest } from 'express';
import { DoctorService, PaginationOptions, HospitalPatientsResponse } from '../doctor/doctor.service';
import { Roles } from './decorators/roles.decorator';
import { GetUser } from './decorators/get-user.decorator';

@Controller('auth/doctors')
export class DoctorController {
  private readonly logger = new Logger(DoctorController.name);

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
  async getPatientsList(@GetUser() user: any) {
    const hospitalId = user.hospitalId;
    
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
    @GetUser() user: any,
    @Query('search') search?: string,
    @Query('name') name?: string,
    @Query('email') email?: string,
    @Query('identifier') identifier?: string,
    @Query('page') page: number = 1,
    @Query('limit') limit: number = 10,
    @Query('sortBy') sortBy: string = 'createdAt',
    @Query('sortOrder') sortOrder: 'asc' | 'desc' = 'desc'
  ): Promise<HospitalPatientsResponse> {
    this.logger.debug(`Getting hospital patients for doctor: ${user.email}, hospitalId: ${user.hospitalId}`);
    
    const result = await this.doctorService.getHospitalPatients(
      user.hospitalId,
      {
        search,
        name,
        email,
        identifier,
        page,
        limit,
        sortBy,
        sortOrder
      }
    );

    this.logger.debug(`Found ${result.data.patients.length} patients`);
    return result;
  }

  @Get('hospital-health-records')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('doctor')
  async getHospitalHealthRecords(
    @GetUser() user: any,
    @Query() filters: {
      patientName?: string,
      patientId?: string,
      diagnosis?: string,
      fromDate?: string,
      toDate?: string
    }
  ) {
    const records = await this.doctorService.getHospitalHealthRecords(
      user.hospitalId,
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
    @GetUser() user: any
  ) {
    const hospitalId = user.hospitalId;
    
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
    @GetUser() user: any
  ) {
    try {
      const doctorId = user.sub;
      const hospitalId = user.hospitalId;

      console.log('Creating health record with:', {
        patientId,
        doctorId,
        hospitalId,
        diagnosis: createHealthRecordDto.diagnosis
      });

      // Verify patient exists and belongs to same hospital
      const patient = await this.userModel.findOne({
        _id: patientId,
        hospitalId: hospitalId,
        userType: 'patient'
      });

      if (!patient) {
        console.log('Patient lookup failed:', {
          patientId,
          hospitalId,
          error: 'Patient not found or does not belong to hospital'
        });
        throw new HttpException('Patient not found or does not belong to your hospital', HttpStatus.NOT_FOUND);
      }

      console.log('Patient found:', {
        patientId: patient._id,
        name: patient.name,
        hospitalId: patient.hospitalId
      });

      // Set default visit date to current time if not provided
      const healthRecordData = {
        ...createHealthRecordDto,
        patientId,
        doctorId,
        hospitalId,
        visitDate: createHealthRecordDto.visitDate || new Date().toISOString()
      };

      const healthRecord = new this.healthRecordModel(healthRecordData);
      const savedRecord = await healthRecord.save();

      console.log('Health record created successfully:', {
        recordId: savedRecord._id,
        patientId: savedRecord.patientId,
        doctorId: savedRecord.doctorId
      });

      return {
        message: 'Health record created successfully',
        data: savedRecord
      };
    } catch (error) {
      console.error('Error creating health record:', {
        error: error.message,
        patientId,
        hospitalId: user.hospitalId
      });
      
      if (error instanceof HttpException) {
        throw error;
      }
      
      throw new HttpException(
        'Error creating health record: ' + error.message,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('available')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('doctor', 'patient')
  async getAvailableDoctors(
    @GetUser() user: any,
    @Query('date') dateStr: string
  ) {
    try {
      console.log('Getting available doctors:', {
        hospitalId: user.hospitalId,
        date: dateStr
      });

      if (!dateStr) {
        throw new HttpException('Date parameter is required', HttpStatus.BAD_REQUEST);
      }

      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        throw new HttpException('Invalid date format. Use YYYY-MM-DD', HttpStatus.BAD_REQUEST);
      }

      // Validate date is not in the past
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (date < today) {
        throw new HttpException('Cannot get availability for past dates', HttpStatus.BAD_REQUEST);
      }

      const doctors = await this.doctorService.getAvailableDoctors(user.hospitalId, date);
      
      console.log('Found available doctors:', {
        count: doctors.data.length,
        hospitalId: user.hospitalId,
        date: dateStr
      });

      return {
        message: 'Available doctors retrieved successfully',
        data: doctors.data
      };
    } catch (error) {
      console.error('Error getting available doctors:', {
        error: error.message,
        hospitalId: user.hospitalId,
        date: dateStr
      });

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Error retrieving available doctors: ' + error.message,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('availability')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('doctor')
  async setAvailability(
    @GetUser() user: any,
    @Body() availabilityDto: { fromTime: string; toTime: string }
  ) {
    const fromTime = new Date(availabilityDto.fromTime);
    const toTime = new Date(availabilityDto.toTime);

    if (isNaN(fromTime.getTime()) || isNaN(toTime.getTime())) {
      throw new HttpException('Invalid date format', HttpStatus.BAD_REQUEST);
    }

    const availability = await this.doctorService.setDoctorAvailability(
      user.sub,
      user.hospitalId,
      fromTime,
      toTime
    );

    return {
      message: 'Availability set successfully',
      data: availability
    };
  }

  @Post('book-appointment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('patient')
  async bookAppointmentAsPatient(
    @GetUser() user: any,
    @Body() bookingDto: { 
      doctorId: string;
      slotTime?: string;
      slotId?: string;
    }
  ) {
    try {
      console.log('Patient booking appointment:', {
        patientId: user.sub,
        doctorId: bookingDto.doctorId,
        hospitalId: user.hospitalId,
        slotTime: bookingDto.slotTime,
        slotId: bookingDto.slotId
      });

      const appointment = await this.doctorService.bookAppointment(
        bookingDto.doctorId,
        user.sub,
        user.hospitalId,
        bookingDto.slotTime,
        bookingDto.slotId
      );

      return {
        message: 'Appointment booked successfully',
        data: appointment
      };
    } catch (error) {
      console.error('Error booking appointment:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Error booking appointment: ' + error.message,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('book-appointment-for-patient')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('doctor')
  async bookAppointmentAsDoctor(
    @GetUser() user: any,
    @Body() bookingDto: { 
      patientId: string;
      slotTime?: string;
      slotId?: string;
    }
  ) {
    try {
      console.log('Doctor booking appointment for patient:', {
        doctorId: user.sub,
        patientId: bookingDto.patientId,
        hospitalId: user.hospitalId,
        slotTime: bookingDto.slotTime,
        slotId: bookingDto.slotId
      });

      // Verify patient belongs to same hospital
      const patient = await this.userModel.findOne({
        _id: bookingDto.patientId,
        hospitalId: user.hospitalId,
        userType: 'patient'
      });

      if (!patient) {
        throw new HttpException('Patient not found or does not belong to your hospital', HttpStatus.NOT_FOUND);
      }

      const appointment = await this.doctorService.bookAppointment(
        user.sub,
        bookingDto.patientId,
        user.hospitalId,
        bookingDto.slotTime,
        bookingDto.slotId
      );

      return {
        message: 'Appointment booked successfully for patient',
        data: appointment
      };
    } catch (error) {
      console.error('Error booking appointment for patient:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Error booking appointment: ' + error.message,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('appointments/booked')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('doctor')
  async getBookedAppointments(
    @GetUser() user: any,
    @Query('date') dateStr: string,
    @Query('patientName') patientName?: string,
    @Query('hospitalId') hospitalId?: string
  ) {
    try {
      console.log('Getting booked appointments:', {
        doctorId: user.sub,
        hospitalId: hospitalId || user.hospitalId,
        date: dateStr,
        patientName
      });

      // Validate date parameter
      if (!dateStr) {
        throw new HttpException('Date parameter is required', HttpStatus.BAD_REQUEST);
      }

      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        throw new HttpException('Invalid date format. Use YYYY-MM-DD', HttpStatus.BAD_REQUEST);
      }

      // Set start and end of the specified date
      const startDate = new Date(date);
      startDate.setHours(0, 0, 0, 0);
      
      const endDate = new Date(date);
      endDate.setHours(23, 59, 59, 999);

      // Use provided hospitalId or fall back to user's hospitalId
      const effectiveHospitalId = hospitalId || user.hospitalId;

      const appointments = await this.doctorService.getBookedAppointments(
        user.sub,
        effectiveHospitalId,
        startDate,
        endDate,
        patientName
      );

      console.log('Found booked appointments:', {
        count: appointments.length,
        doctorId: user.sub,
        hospitalId: effectiveHospitalId,
        date: dateStr,
        patientName
      });

      return {
        message: 'Booked appointments retrieved successfully',
        data: appointments
      };
    } catch (error) {
      console.error('Error getting booked appointments:', {
        error: error.message,
        doctorId: user.sub,
        hospitalId: hospitalId || user.hospitalId,
        date: dateStr,
        patientName
      });

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Error retrieving booked appointments: ' + error.message,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get('patients/payments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('doctor')
  async getPatientPayments(
    @GetUser() user: any,
    @Query('hospitalId') hospitalId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('patientId') patientId?: string
  ) {
    try {
      this.logger.debug('Getting patient payments:', {
        doctorId: user.sub,
        hospitalId: hospitalId || user.hospitalId,
        fromDate,
        toDate,
        patientId
      });

      // Parse dates if provided
      let startDate: Date | undefined;
      let endDate: Date | undefined;

      if (fromDate) {
        startDate = new Date(fromDate);
        if (isNaN(startDate.getTime())) {
          throw new HttpException('Invalid fromDate format. Use YYYY-MM-DD', HttpStatus.BAD_REQUEST);
        }
        startDate.setHours(0, 0, 0, 0);
      }

      if (toDate) {
        endDate = new Date(toDate);
        if (isNaN(endDate.getTime())) {
          throw new HttpException('Invalid toDate format. Use YYYY-MM-DD', HttpStatus.BAD_REQUEST);
        }
        endDate.setHours(23, 59, 59, 999);
      }

      const payments = await this.doctorService.getPatientPayments(
        user.sub,
        user.hospitalId,
        {
          fromDate: startDate,
          toDate: endDate,
          patientId
        }
      );

      this.logger.debug('Found patient payments:', {
        count: payments.length,
        doctorId: user.sub,
        hospitalId: user.hospitalId
      });

      return {
        message: 'Patient payments retrieved successfully',
        data: payments
      };
    } catch (error) {
      this.logger.error('Error getting patient payments:', {
        error: error.message,
        doctorId: user.sub,
        hospitalId: user.hospitalId
      });

      if (error instanceof HttpException) {
        throw error;
      }

      throw new HttpException(
        'Error retrieving patient payments: ' + error.message,
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}