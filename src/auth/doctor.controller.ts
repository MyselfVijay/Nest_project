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
    try {
      console.log('Fetching hospital patients with filters:', {
        hospitalId: req.user.hospitalId,
        name,
        email,
        patientId
      });

      const patients = await this.doctorService.getHospitalPatients(
        req.user.hospitalId,
        { name, email, patientId }
      );

      console.log('Found patients:', patients.length);

      return {
        message: "Hospital patient's list retrieved successfully",
        data: patients
      };
    } catch (error) {
      console.error('Error fetching hospital patients:', error);
      throw new HttpException(
        'Error retrieving hospital patients',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
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
    try {
      const doctorId = req.user.sub;
      const hospitalId = req.user.hospitalId;

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
        hospitalId: req.user.hospitalId
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
    @Request() req,
    @Query('date') dateStr: string
  ) {
    try {
      console.log('Getting available doctors:', {
        hospitalId: req.user.hospitalId,
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

      const doctors = await this.doctorService.getAvailableDoctors(req.user.hospitalId, date);
      
      console.log('Found available doctors:', {
        count: doctors.data.length,
        hospitalId: req.user.hospitalId,
        date: dateStr
      });

      return {
        message: 'Available doctors retrieved successfully',
        data: doctors.data
      };
    } catch (error) {
      console.error('Error getting available doctors:', {
        error: error.message,
        hospitalId: req.user.hospitalId,
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

  @Post('book-appointment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('patient')
  async bookAppointmentAsPatient(
    @Req() req: ExpressRequest & { user: { sub: string, hospitalId: string } },
    @Body() bookingDto: { 
      doctorId: string;
      slotTime?: string;
      slotId?: string;
    }
  ) {
    try {
      console.log('Patient booking appointment:', {
        patientId: req.user.sub,
        doctorId: bookingDto.doctorId,
        hospitalId: req.user.hospitalId,
        slotTime: bookingDto.slotTime,
        slotId: bookingDto.slotId
      });

      const appointment = await this.doctorService.bookAppointment(
        bookingDto.doctorId,
        req.user.sub,
        req.user.hospitalId,
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
    @Req() req: ExpressRequest & { user: { sub: string, hospitalId: string } },
    @Body() bookingDto: { 
      patientId: string;
      slotTime?: string;
      slotId?: string;
    }
  ) {
    try {
      console.log('Doctor booking appointment for patient:', {
        doctorId: req.user.sub,
        patientId: bookingDto.patientId,
        hospitalId: req.user.hospitalId,
        slotTime: bookingDto.slotTime,
        slotId: bookingDto.slotId
      });

      // Verify patient belongs to same hospital
      const patient = await this.userModel.findOne({
        _id: bookingDto.patientId,
        hospitalId: req.user.hospitalId,
        userType: 'patient'
      });

      if (!patient) {
        throw new HttpException('Patient not found or does not belong to your hospital', HttpStatus.NOT_FOUND);
      }

      const appointment = await this.doctorService.bookAppointment(
        req.user.sub,
        bookingDto.patientId,
        req.user.hospitalId,
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
    @Req() req: ExpressRequest & { user: { sub: string, hospitalId: string } },
    @Query('date') dateStr: string,
    @Query('patientName') patientName?: string,
    @Query('hospitalId') hospitalId?: string
  ) {
    try {
      console.log('Getting booked appointments:', {
        doctorId: req.user.sub,
        hospitalId: hospitalId || req.user.hospitalId,
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
      const effectiveHospitalId = hospitalId || req.user.hospitalId;

      const appointments = await this.doctorService.getBookedAppointments(
        req.user.sub,
        effectiveHospitalId,
        startDate,
        endDate,
        patientName
      );

      console.log('Found booked appointments:', {
        count: appointments.length,
        doctorId: req.user.sub,
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
        doctorId: req.user.sub,
        hospitalId: hospitalId || req.user.hospitalId,
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
    @Req() req: ExpressRequest & { user: { sub: string, hospitalId: string } },
    @Query('hospitalId') hospitalId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('patientId') patientId?: string
  ) {
    try {
      console.log('Getting patient payments:', {
        doctorId: req.user.sub,
        hospitalId: hospitalId || req.user.hospitalId,
        fromDate,
        toDate,
        patientId
      });

      // Use provided hospitalId or fall back to user's hospitalId
      const effectiveHospitalId = hospitalId || req.user.hospitalId;

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
        req.user.sub,
        effectiveHospitalId,
        {
          fromDate: startDate,
          toDate: endDate,
          patientId
        }
      );

      console.log('Found patient payments:', {
        count: payments.length,
        doctorId: req.user.sub,
        hospitalId: effectiveHospitalId,
        dateRange: fromDate && toDate ? `${fromDate} to ${toDate}` : 'all time'
      });

      return {
        message: 'Patient payments retrieved successfully',
        data: payments
      };
    } catch (error) {
      console.error('Error getting patient payments:', {
        error: error.message,
        doctorId: req.user.sub,
        hospitalId: hospitalId || req.user.hospitalId
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