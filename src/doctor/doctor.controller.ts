import { Controller, Put, Delete, Post, Get, Body, Param, Headers, UseGuards, Query, NotFoundException, BadRequestException, HttpException, HttpStatus } from '@nestjs/common';
import { DoctorService } from './doctor.service';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request as Req } from '@nestjs/common';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ExpressRequest } from '../auth/interfaces/express-request.interface';

@Controller('auth/doctors')
export class DoctorController {
  constructor(private readonly doctorService: DoctorService) {}

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async updateDoctor(
    @Param('id') id: string,
    @Body() updateDoctorDto: UpdateDoctorDto,
    @Headers('hospital-id') hospitalId: string,
  ) {
    return this.doctorService.update(id, updateDoctorDto, hospitalId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async deleteDoctor(
    @Param('id') id: string,
    @Req() req: ExpressRequest & { user: { sub: string, hospitalId: string } }
  ) {
    return this.doctorService.remove(id, req.user.hospitalId);
  }

  @Post('book-appointment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('doctor')
  async bookAppointment(
    @Body() appointmentData: {
      doctorId: string;
      patientId: string;
      slotTime?: string;
      slotId?: string;
    },
    @Headers('hospital-id') hospitalId: string,
  ) {
    return this.doctorService.bookAppointment(
      appointmentData.doctorId,
      appointmentData.patientId,
      hospitalId,
      appointmentData.slotTime,
      appointmentData.slotId
    );
  }

  @Get('available')
  async getAvailableDoctors(
    @Headers('hospital-id') hospitalId: string,
    @Query('date') date: string,
  ) {
    return this.doctorService.getAvailableDoctors(hospitalId, new Date(date));
  }

  @Post('availability')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('doctor')
  async setDoctorAvailability(
    @Headers('hospital-id') hospitalId: string,
    @Body() availabilityData: {
      doctorId: string;
      fromTime: string;
      toTime: string;
    }
  ) {
    return this.doctorService.setDoctorAvailability(
      availabilityData.doctorId,
      hospitalId,
      new Date(availabilityData.fromTime),
      new Date(availabilityData.toTime)
    );
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
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('doctor')
  async getHospitalPatients(
    @Req() req: ExpressRequest & { user: { sub: string, hospitalId: string } },
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
}