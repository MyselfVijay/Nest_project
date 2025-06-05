import { Controller, Put, Delete, Post, Get, Body, Param, Headers, UseGuards, Query, NotFoundException, BadRequestException, HttpException, HttpStatus, UseFilters, Logger, InternalServerErrorException } from '@nestjs/common';
import { DoctorService, PaginationOptions, HospitalPatientsResponse } from './doctor.service';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request as Req } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ExpressRequest } from '../auth/interfaces/express-request.interface';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { TokenBlockFilter } from '../token/token-block.filter';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import { HealthRecord, HealthRecordDocument } from '../schemas/health-record.schema';

@Controller('auth/doctors')
@UseGuards(JwtAuthGuard, RolesGuard)
@UseFilters(TokenBlockFilter)
export class DoctorController {
  private readonly logger = new Logger(DoctorController.name);

  constructor(
    private readonly doctorService: DoctorService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(HealthRecord.name) private healthRecordModel: Model<HealthRecordDocument>
  ) {}

  @Post('register')
  async register(@Body() createDoctorDto: CreateDoctorDto, @Headers('hospital-id') hospitalId: string) {
    return this.doctorService.create(createDoctorDto, hospitalId);
  }

  @Put(':id')
  @Roles('admin')
  async updateDoctor(
    @Param('id') id: string,
    @Body() updateDoctorDto: UpdateDoctorDto,
    @Headers('hospital-id') hospitalId: string,
  ) {
    return this.doctorService.update(id, updateDoctorDto, hospitalId);
  }

  @Delete(':id')
  @Roles('admin')
  async deleteDoctor(
    @Param('id') id: string,
    @Req() req: ExpressRequest & { user: { sub: string, hospitalId: string } }
  ) {
    return this.doctorService.remove(id, req.user.hospitalId);
  }

  @Post('book-appointment')
  @Roles('doctor', 'patient')
  async bookAppointment(
    @GetUser() user: any,
    @Body() bookingDto: { 
      doctorId?: string;
      patientId?: string;
      slotTime?: string;
      slotId?: string;
      date?: string;
    }
  ) {
    try {
      this.logger.debug('Booking appointment:', {
        userType: user.userType,
        userId: user.sub,
        doctorId: bookingDto.doctorId,
        patientId: bookingDto.patientId,
        slotTime: bookingDto.slotTime,
        slotId: bookingDto.slotId,
        date: bookingDto.date,
        hospitalId: user.hospitalId
      });

      // Determine the effective doctor and patient IDs based on user type
      let effectiveDoctorId: string;
      let effectivePatientId: string;

      // Get user type from JWT token
      const userType = user.userType;

      if (userType === 'doctor') {
        // Doctor booking for a patient
        if (!bookingDto.patientId) {
          throw new BadRequestException('Patient ID is required when booking as a doctor');
        }
        effectiveDoctorId = user.sub; // Doctor's own ID from token
        effectivePatientId = bookingDto.patientId;

        // Verify patient belongs to same hospital
        const patient = await this.userModel.findOne({
          _id: effectivePatientId,
          hospitalId: user.hospitalId,
          userType: 'patient'
        });

        if (!patient) {
          throw new NotFoundException('Patient not found or does not belong to your hospital');
        }
      } else if (userType === 'patient') {
        // Patient booking for themselves
        if (!bookingDto.doctorId) {
          throw new BadRequestException('Doctor ID is required when booking as a patient');
        }
        effectiveDoctorId = bookingDto.doctorId;
        effectivePatientId = user.sub; // Patient's own ID from token

        // Verify doctor belongs to same hospital
        const doctor = await this.userModel.findOne({
          _id: effectiveDoctorId,
          hospitalId: user.hospitalId,
          userType: 'doctor'
        });

        if (!doctor) {
          throw new NotFoundException('Doctor not found or does not belong to your hospital');
        }
      } else {
        throw new BadRequestException('Invalid user type. Must be either doctor or patient');
      }

      // Validate booking method (slotId or slotTime+date)
      if (!bookingDto.slotId && (!bookingDto.slotTime || !bookingDto.date)) {
        throw new BadRequestException('Either slotId OR both slotTime and date are required');
      }

      // If using slotTime, validate date and time format
      if (bookingDto.slotTime && bookingDto.date) {
        const appointmentDate = new Date(bookingDto.date);
        if (isNaN(appointmentDate.getTime())) {
          throw new BadRequestException('Invalid date format. Use YYYY-MM-DD');
        }

        // Validate date is not in the past
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (appointmentDate < today) {
          throw new BadRequestException('Cannot book appointments for past dates');
        }

        // Validate time format
        if (!bookingDto.slotTime.match(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]-([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/)) {
          throw new BadRequestException('Invalid slot time format. Use format HH:MM-HH:MM (e.g., 09:00-09:30)');
        }
      }

      const appointment = await this.doctorService.bookAppointment(
        effectiveDoctorId,
        effectivePatientId,
        user.hospitalId,
        bookingDto.slotTime,
        bookingDto.slotId,
        bookingDto.date
      );

      return {
        message: userType === 'doctor' ? 'Appointment booked successfully for patient' : 'Appointment booked successfully',
        data: appointment
      };
    } catch (error) {
      this.logger.error('Error booking appointment:', error);
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Error booking appointment: ' + error.message);
    }
  }

  @Get('available')
  async getAvailableDoctors(
    @GetUser() user: any,
    @Query('date') date: string,
  ) {
    if (!user?.hospitalId) {
      throw new BadRequestException('Hospital ID not found in token');
    }

    if (!date) {
      throw new BadRequestException('Date is required');
    }

    const parsedDate = new Date(date);
    if (isNaN(parsedDate.getTime())) {
      throw new BadRequestException('Invalid date format');
    }

    return this.doctorService.getAvailableDoctors(user.hospitalId, parsedDate);
  }

  @Post('availability')
  @Roles('doctor')
  async setDoctorAvailability(
    @GetUser() user: any,
    @Body() availabilityData: {
      fromTime: string;
      toTime: string;
    }
  ) {
    this.logger.debug(`Setting availability for doctor: ${user.sub}, hospitalId: ${user.hospitalId}`);

    if (!user?.sub || !user?.hospitalId) {
      throw new BadRequestException('Doctor ID or Hospital ID not found in token');
    }

    const fromTime = new Date(availabilityData.fromTime);
    const toTime = new Date(availabilityData.toTime);

    if (isNaN(fromTime.getTime()) || isNaN(toTime.getTime())) {
      throw new BadRequestException('Invalid date format for fromTime or toTime');
    }

    return this.doctorService.setDoctorAvailability(
      user.sub, // doctorId from JWT token
      user.hospitalId, // hospitalId from JWT token
      fromTime,
      toTime
    );
  }

  @Get('appointments/booked')
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
        req.user.sub,  // doctorId
        effectiveHospitalId,  // hospitalId
        startDate,  // startDate
        endDate,  // endDate
        patientName  // patientName (optional)
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

  @Get('slots/available')
  async getAvailableSlots(
    @Headers('hospital-id') hospitalId: string,
    @Query('date') date: string,
    @Query('doctorId') doctorId?: string
  ) {
    if (!date) {
      throw new BadRequestException('Date is required');
    }
    return this.doctorService.getAvailableDoctors(hospitalId, new Date(date));
  }

  @Get('hospital-patients')
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
    this.logger.debug(`Getting hospital patients for doctor: ${user.email}, hospitalId: ${user.hospitalId}, filters:`, {
      search, name, email, identifier, page, limit, sortBy, sortOrder
    });
    
    // Ensure page and limit are numbers
    const pageNum = Number(page);
    const limitNum = Number(limit);

    if (isNaN(pageNum) || isNaN(limitNum)) {
      throw new BadRequestException('Page and limit must be valid numbers');
    }

    return this.doctorService.getHospitalPatients(
      user.hospitalId,
      {
        search: search?.trim(),
        name: name?.trim(),
        email: email?.trim(),
        identifier: identifier?.trim(),
        page: pageNum,
        limit: limitNum,
        sortBy,
        sortOrder
      }
    );
  }

  @Post('hospital-patients')
  @Roles('doctor')
  async searchHospitalPatients(
    @GetUser() user: any,
    @Body() searchParams: {
      search?: string;
      name?: string;
      email?: string;
      identifier?: string;
      page?: number;
      limit?: number;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    } = {}
  ): Promise<HospitalPatientsResponse> {
    if (!user?.hospitalId) {
      throw new BadRequestException('Hospital ID is required');
    }

    this.logger.debug(`Searching hospital patients for doctor: ${user.sub}, hospitalId: ${user.hospitalId}`);
    
    const {
      search,
      name,
      email,
      identifier,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = searchParams;

    return this.doctorService.getHospitalPatients(
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
  }

  @Post('patients/:patientId/health-records')
  @Roles('doctor')
  async createHealthRecord(
    @Param('patientId') patientId: string,
    @GetUser() user: any,
    @Body() healthRecordData: {
      diagnosis: string;
      prescription: string;
      notes?: string;
    }
  ) {
    try {
      // Validate patient exists and belongs to doctor's hospital
      const patient = await this.userModel.findOne({
        _id: patientId,
        hospitalId: user.hospitalId,
        userType: 'patient'
      });

      if (!patient) {
        throw new NotFoundException('Patient not found');
      }

      // Create health record
      const healthRecord = new this.healthRecordModel({
        patientId,
        doctorId: user.sub,
        hospitalId: user.hospitalId,
        diagnosis: healthRecordData.diagnosis,
        prescription: healthRecordData.prescription,
        notes: healthRecordData.notes,
        visitDate: new Date()
      });

      const savedRecord = await healthRecord.save();

      return {
        message: 'Health record created successfully',
        data: {
          _id: savedRecord._id,
          patientId: savedRecord.patientId,
          doctorId: savedRecord.doctorId,
          hospitalId: savedRecord.hospitalId,
          diagnosis: savedRecord.diagnosis,
          prescription: savedRecord.prescription,
          notes: savedRecord.notes,
          visitDate: savedRecord.visitDate
        }
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error('Error creating health record:', error);
      throw new InternalServerErrorException('Failed to create health record');
    }
  }

  @Get('hospital-health-records')
  @Roles('doctor')
  async getHospitalHealthRecords(
    @GetUser() user: any,
    @Query() filters: {
      patientName?: string;
      patientId?: string;
      diagnosis?: string;
      fromDate?: string;
      toDate?: string;
    }
  ) {
    this.logger.debug(`Getting hospital health records for doctor: ${user.email}, hospitalId: ${user.hospitalId}, filters:`, filters);

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
  @Roles('doctor')
  async getPatientHealthRecords(
    @Param('patientId') patientId: string,
    @GetUser() user: any
  ) {
    this.logger.debug(`Getting health records for patient: ${patientId}, doctor: ${user.email}, hospitalId: ${user.hospitalId}`);

    // Verify patient exists and belongs to same hospital
    const patient = await this.userModel.findOne({
      _id: patientId,
      hospitalId: user.hospitalId,
      userType: 'patient'
    });

    if (!patient) {
      throw new NotFoundException('Patient not found');
    }

    const records = await this.healthRecordModel.find({ patientId })
      .populate('doctorId', 'name email')
      .sort({ visitDate: -1 });

    return {
      message: 'Patient health records retrieved successfully',
      data: records
    };
  }
}