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
import { Roles } from './decorators/roles.decorator';
import { RequestUser } from './interfaces/request-user.interface';

interface RequestWithUser extends ExpressRequest {
  user: RequestUser;
}

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
      const existingUser = await this.userModel.findOne({ 
        email: createPatientDto.email.toLowerCase() 
      });
      if (existingUser) {
        // If user exists but doesn't have hospitalId, update it
        if (!existingUser.hospitalId) {
          existingUser.hospitalId = hospitalId;
          await existingUser.save();
          return {
            message: 'Patient hospital updated successfully',
            data: {
              userId: existingUser._id,
              name: existingUser.name,
              email: existingUser.email,
              mobileNo: existingUser.mobileNo,
              userType: existingUser.userType,
              hospitalId: existingUser.hospitalId
            }
          };
        }
        throw new HttpException('Email already registered', HttpStatus.CONFLICT);
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(createPatientDto.password, 10);

      // Create new patient with all required fields
      const newPatient = new this.userModel({
        name: createPatientDto.name,
        email: createPatientDto.email.toLowerCase(),
        password: hashedPassword,
        mobileNo: createPatientDto.mobileNo,
        hospitalId: hospitalId,
        userType: 'patient',
        dob: new Date(createPatientDto.dob),
        createdAt: new Date(),
        lastLogin: null,
        status: 'active' // Set initial status as active
      });

      // Save patient
      const savedPatient = await newPatient.save();

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
          createdAt: savedPatient.createdAt,
          lastLogin: savedPatient.lastLogin,
          status: savedPatient.status
        }
      };
    } catch (error) {
      console.error('Patient registration error:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'An error occurred while registering the patient',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('assign-hospital')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'doctor')
  async assignHospital(
    @Body() data: { patientId: string, hospitalId: string },
    @Req() req: ExpressRequest & { user: { sub: string, hospitalId: string, userType: string } }
  ) {
    try {
      // Verify the requesting user has permission
      if (req.user.userType === 'doctor' && req.user.hospitalId !== data.hospitalId) {
        throw new HttpException('You can only assign patients to your hospital', HttpStatus.FORBIDDEN);
      }

      const patient = await this.userModel.findOne({
        _id: data.patientId,
        userType: 'patient'
      });

      if (!patient) {
        throw new HttpException('Patient not found', HttpStatus.NOT_FOUND);
      }

      // Update hospital assignment
      patient.hospitalId = data.hospitalId;
      await patient.save();

      return {
        message: 'Patient hospital assignment updated successfully',
        data: {
          userId: patient._id,
          name: patient.name,
          email: patient.email,
          hospitalId: patient.hospitalId
        }
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'Error updating patient hospital assignment',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'doctor', 'patient')
  async getPatient(
    @Param('id') id: string,
    @Req() req: RequestWithUser
  ) {
    try {
      if (!req.user) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      if (!Types.ObjectId.isValid(id)) {
        throw new HttpException('Invalid patient ID', HttpStatus.BAD_REQUEST);
      }

      // If patient is accessing their own data, verify the ID matches
      if (req.user.userType === 'patient' && req.user.sub !== id) {
        throw new HttpException('Unauthorized access', HttpStatus.FORBIDDEN);
      }

      const patient = await this.userModel.findOne({ 
        _id: new Types.ObjectId(id), 
        userType: 'patient',
        hospitalId: req.user.hospitalId // Ensure patient belongs to same hospital
      });
      if (!patient) {
        throw new HttpException('Patient not found', HttpStatus.NOT_FOUND);
      }

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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'doctor')
  async deletePatient(
    @Param('id') id: string,
    @Req() req: ExpressRequest & { user: { sub: string, hospitalId: string } }
  ) {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new HttpException('Invalid patient ID', HttpStatus.BAD_REQUEST);
      }

      const patient = await this.userModel.findOneAndDelete({
        _id: new Types.ObjectId(id),
        userType: 'patient',
        hospitalId: req.user.hospitalId // Ensure patient belongs to same hospital
      });

      if (!patient) {
        throw new HttpException('Patient not found', HttpStatus.NOT_FOUND);
      }

      return {
        message: 'Patient deleted successfully'
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
  }

  @Get('health-records')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('patient')
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('patient')
  async bookAppointment(
    @Req() req: RequestWithUser,
    @Body() bookingDto: { doctorId: string; appointmentDate: string }
  ) {
    if (!req.user) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const appointmentDate = new Date(bookingDto.appointmentDate);
    if (isNaN(appointmentDate.getTime())) {
      throw new HttpException('Invalid date format', HttpStatus.BAD_REQUEST);
    }

    const appointment = await this.doctorService.bookAppointment(
      bookingDto.doctorId,
      req.user.sub,
      req.user.hospitalId,
      appointmentDate.toISOString()
    );

    return {
      message: 'Appointment booked successfully',
      data: appointment
    };
  }
}