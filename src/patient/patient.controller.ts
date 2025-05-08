import { Controller, Post, Put, Delete, Body, Param, Headers } from '@nestjs/common';
import { PatientService } from './patient.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

@Controller('api/patient')  // Updated path
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  @Post()  // Changed from 'create/patient' to root path
  async createPatient(
    @Body() createPatientDto: any,
    @Headers('hospital-id') hospitalId: string,
  ) {
    return this.patientService.create(createPatientDto, hospitalId);
  }

  @Put(':id')
  async updatePatient(
    @Param('id') id: string,
    @Body() updatePatientDto: UpdatePatientDto,
    @Headers('hospital-id') hospitalId: string,
  ) {
    return this.patientService.update(id, updatePatientDto, hospitalId);
  }

  @Delete(':id')
  async deletePatient(
    @Param('id') id: string,
    @Headers('hospital-id') hospitalId: string,
  ) {
    return this.patientService.remove(id, hospitalId);
  }
}