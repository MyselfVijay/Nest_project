import { Controller, Post, Body, Get } from '@nestjs/common';
import { HospitalService } from './hospital.service';
import { CreateHospitalDto } from './dto/create-hospital.dto';

@Controller('hospital')
export class HospitalController {
  constructor(private readonly hospitalService: HospitalService) {}

  @Post()
  async createHospital(@Body() createHospitalDto: CreateHospitalDto) {
    return this.hospitalService.create(createHospitalDto);
  }

  @Post('multiple')
  async createMultipleHospitals(@Body() hospitals: CreateHospitalDto[]) {
    return this.hospitalService.createMultiple(hospitals);
  }

  @Get()
  async getAllHospitals() {
    return this.hospitalService.findAll();
  }
}