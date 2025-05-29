import { Controller, Post, Body, UseInterceptors, UploadedFile, UseGuards, Headers } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IdentifierAuthService } from './identifier-auth.service';
import { IdentifierRegisterDto } from './dto/identifier-register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Controller('auth/identifier')
export class IdentifierAuthController {
  constructor(private readonly identifierAuthService: IdentifierAuthService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadIdentifierFile(@UploadedFile() file: Express.Multer.File) {
    return this.identifierAuthService.processIdentifierFile(file);
  }

  @Post('generate-otp')
  async generateOtp(@Body('identifier') identifier: string) {
    return this.identifierAuthService.generateOtp(identifier);
  }

  @Post('verify-otp')
  async verifyOtp(
    @Body('identifier') identifier: string,
    @Body('otp') otp: string,
  ) {
    return this.identifierAuthService.verifyOtp(identifier, otp);
  }

  @Post('register')
  @UseGuards(JwtAuthGuard)
  async completeRegistration(
    @Body() registerDto: IdentifierRegisterDto,
    @Headers('authorization') auth: string,
  ) {
    const accessToken = auth.split(' ')[1];
    return this.identifierAuthService.completeRegistration(registerDto, accessToken);
  }
} 