import { Controller, Put, Delete, Post, Get, Body, Param, Headers, UseGuards, Query, NotFoundException } from '@nestjs/common';
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
      slotId: string;
      patientId: string;
    },
    @Headers('hospital-id') hospitalId: string,
  ) {
    const slot = await this.doctorService.getAvailabilitySlot(appointmentData.slotId);
    if (!slot) {
      throw new NotFoundException('Slot not found');
    }

    return this.doctorService.bookAppointment(
      slot.doctorId.toString(),
      appointmentData.patientId,
      hospitalId,
      slot.fromTime
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
}