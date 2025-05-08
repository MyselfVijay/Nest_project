import { Controller, Post, Body, HttpStatus, HttpException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import { RegisterDto } from './dto/register.dto';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

@Controller('auth/doctors')
export class DoctorController {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private authService: AuthService
  ) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    // Check if user already exists
    const existingUser = await this.userModel.findOne({ email: registerDto.email });
    if (existingUser) {
      throw new HttpException('Email already registered', HttpStatus.CONFLICT);
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Create new doctor
    const newDoctor = new this.userModel({
      name: registerDto.name,
      email: registerDto.email,
      password: hashedPassword,
      mobileNo: registerDto.mobileNo,
      hospitalId: registerDto.hospitalCode,
      userType: 'doctor',
      createdAt: new Date(),
      lastLogin: null
    });

    // Save doctor
    const savedDoctor = await newDoctor.save();

    // Generate tokens
    const tokens = await this.authService.generateTokens(
      savedDoctor._id, // Pass ObjectId directly
      savedDoctor.hospitalId,
      'doctor'
    );

    return {
      message: 'Doctor registered successfully',
      data: {
        userId: savedDoctor._id,
        name: savedDoctor.name,
        email: savedDoctor.email,
        userType: savedDoctor.userType,
        hospitalId: savedDoctor.hospitalId,
        accessToken: tokens.accessToken
      }
    };
  }
}