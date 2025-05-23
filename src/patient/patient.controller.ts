import { Controller, Get, Post, Put, Delete, Body, Param, UseGuards, UseInterceptors, UploadedFile, Headers, Header } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Express } from 'express';
import { PatientService } from './patient.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RoleGuard } from '../auth/guards/role.guard';
import { Role } from '../auth/decorators/role.decorator';
import { SendOtpDto } from './dto/send-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Controller('patient')
export class PatientController {
  constructor(private readonly patientService: PatientService) {}

  @Post('send-otp')
  async sendOtp(@Body() sendOtpDto: SendOtpDto) {
    return this.patientService.sendOtp(sendOtpDto);
  }

  @Post('reset-password')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.patientService.resetPassword(resetPasswordDto);
  }

  // CREATE - Register new patient
  @Post()
  async createPatient(@Body() createPatientDto: any) {
    return this.patientService.create(createPatientDto);
  }

  // READ - Get all patients (protected, admin only)
  @Get()
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Role('admin')
  async getAllPatients() {
    return this.patientService.findAll();
  }

  @Get('export')
  @UseGuards(JwtAuthGuard)
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename=patients.xlsx')
  async exportPatients(@Headers('hospital-id') hospitalId: string) {
    return this.patientService.exportPatientsToSpreadsheet(hospitalId);
  }

  // READ - Get patient by ID
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async getPatient(@Param('id') id: string) {
    return this.patientService.findOne(id);
  }

  // UPDATE - Update patient info
  @Put(':id')
  @UseGuards(JwtAuthGuard)
  async updatePatient(
    @Param('id') id: string,
    @Body() updatePatientDto: any
  ) {
    return this.patientService.update(id, updatePatientDto);
  }

  // DELETE - Remove patient
  @Delete(':id')
  @UseGuards(JwtAuthGuard, RoleGuard)
  @Role('admin')
  async removePatient(@Param('id') id: string) {
    return this.patientService.remove(id);
  }

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadPatients(
    @UploadedFile() file: Express.Multer.File,
    @Headers('hospital-id') hospitalId: string
  ) {
    return this.patientService.uploadPatientsFromSpreadsheet(file, hospitalId);
  }
}