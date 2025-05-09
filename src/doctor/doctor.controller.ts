import { Controller, Put, Delete, Body, Param, Headers } from '@nestjs/common';
import { DoctorService } from './doctor.service';
import { UpdateDoctorDto } from './dto/update-doctor.dto';

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
}