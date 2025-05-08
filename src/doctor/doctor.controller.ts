import { Controller, Post, Put, Delete, Body, Param, Headers } from '@nestjs/common';
import { DoctorService } from './doctor.service';
import { CreateDoctorDto } from './dto/create-doctor.dto';
import { UpdateDoctorDto } from './dto/update-doctor.dto';

@Controller('doctors')  // Change from 'api/doctor' to 'doctors'
export class DoctorController {
  constructor(private readonly doctorService: DoctorService) {}

  @Post()  // Changed from 'create/doctor' to root path
  async createDoctor(
    @Body() createDoctorDto: CreateDoctorDto,
    @Headers('hospital-id') hospitalId: string,
  ) {
    return this.doctorService.create(createDoctorDto, hospitalId);
  }

  @Put(':id')  // This is correctly defined
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
}