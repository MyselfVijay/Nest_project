import { Controller, Put, Delete, Post, Get, Body, Param, Headers, UseGuards, Query, NotFoundException, BadRequestException } from '@nestjs/common';
import { DoctorService } from './doctor.service';
import { UpdateDoctorDto } from './dto/update-doctor.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('doctors')
export class DoctorController {
  constructor(private readonly doctorService: DoctorService) {}

  @Put(':id')
  async updateDoctor(
    @Param('id') id: string,
    @Body() updateDoctorDto: UpdateDoctorDto,
    @Headers('hospital-id') hospitalId: string,
  ) {
    return this.doctorService.update(id, updateDoctorDto, hospitalId);
  }

  @Delete(':id')
  async deleteDoctor(
    @Param('id') id: string,
    @Headers('hospital-id') hospitalId: string,
  ) {
    return this.doctorService.remove(id, hospitalId);
  }

  @Post('appointments')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  async getAvailableDoctors(
    @Headers('hospital-id') hospitalId: string,
    @Query('date') date: string,
  ) {
    return this.doctorService.getAvailableDoctors(hospitalId, new Date(date));
  }

  @Post('availability')
  @UseGuards(JwtAuthGuard)
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
  @UseGuards(JwtAuthGuard)
  async getBookedAppointments(
    @Headers('hospital-id') hospitalId: string,
    @Query('doctorId') doctorId?: string,
    @Query('patientId') patientId?: string,
    @Query('fromDate') fromDate?: string,
    @Query('toDate') toDate?: string,
    @Query('status') status?: 'scheduled' | 'completed' | 'cancelled'
  ) {
    return this.doctorService.getBookedAppointments(hospitalId, {
      doctorId,
      patientId,
      fromDate: fromDate ? new Date(fromDate) : undefined,
      toDate: toDate ? new Date(toDate) : undefined,
      status
    });
  }

  @Get('slots/available')
  @UseGuards(JwtAuthGuard)
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
}