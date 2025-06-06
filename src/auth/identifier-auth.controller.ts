import { Controller, Post, Body, UseInterceptors, UploadedFile, UseGuards, Headers, Delete, Param, HttpException, HttpStatus, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IdentifierAuthService } from './identifier-auth.service';
import { IdentifierRegisterDto } from './dto/identifier-register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { Types } from 'mongoose';

@Controller('auth/identifier')
export class IdentifierAuthController {
  constructor(private readonly identifierAuthService: IdentifierAuthService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @UseGuards(JwtAuthGuard)
  async uploadIdentifierFile(@UploadedFile() file: Express.Multer.File) {
    return this.identifierAuthService.processIdentifierFile(file);
  }

  @Post('generate-otp')
  async generateOtp(
    @Body('identifier') identifier: string
  ) {
    if (!identifier) {
      throw new BadRequestException('Identifier is required');
    }
    return this.identifierAuthService.generateOtp(identifier);
  }

  @Post('verify-otp')
  async verifyOtp(
    @Body('identifier') identifier: string,
    @Body('otp') otp: string,
  ) {
    if (!identifier || !otp) {
      throw new BadRequestException('Identifier and OTP are required');
    }
    return this.identifierAuthService.verifyOtp(identifier, otp);
  }

  @Post('register')
  @UseGuards(JwtAuthGuard)
  async completeRegistration(
    @Body() registerDto: IdentifierRegisterDto,
    @Headers('authorization') auth: string,
    @Headers('hospital-id') hospitalId: string,
  ) {
    if (!hospitalId) {
      throw new BadRequestException('Hospital ID header is required');
    }
    const accessToken = auth.split(' ')[1];
    return this.identifierAuthService.completeRegistration(registerDto, accessToken, hospitalId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'doctor')
  async deleteIdentifier(@Param('id') id: string) {
    // Check if the id is a valid MongoDB ObjectId
    if (Types.ObjectId.isValid(id)) {
      return this.identifierAuthService.deleteIdentifierById(id);
    }
    // If not an ObjectId, treat it as an identifier value
    return this.identifierAuthService.deleteIdentifier(id);
  }
} 