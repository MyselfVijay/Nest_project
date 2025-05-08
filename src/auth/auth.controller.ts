import { Controller, Post, Body, UnauthorizedException, ConflictException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../users/user.entity';
import * as bcrypt from 'bcryptjs';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @InjectModel(User.name) private userModel: Model<User>
  ) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    // Check if user already exists
    const existingUser = await this.userModel.findOne({
      email: registerDto.email.toLowerCase(),
      hospitalId: registerDto.hospitalCode
    });

    if (existingUser) {
      throw new ConflictException('User already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(registerDto.password, 10);

    // Create new user
    const user = await this.userModel.create({
      name: registerDto.name,
      email: registerDto.email.toLowerCase(),
      password: hashedPassword,
      mobileNo: registerDto.mobileNo,
      userType: 'doctor',
      hospitalId: registerDto.hospitalCode
    });

    // Generate tokens
    const tokens = await this.authService.generateTokens(
      user.id,
      user.hospitalId,
      user.userType
    );

    return {
      message: 'Registration successful',
      data: {
        userId: user.id,
        name: user.name,
        email: user.email,
        userType: user.userType,
        hospitalId: user.hospitalId,
        ...tokens
      }
    };
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    // Find user by email and hospital
    const user = await this.userModel.findOne({ 
      email: loginDto.email.toLowerCase(),
      hospitalId: loginDto.hospitalCode
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    await this.userModel.findByIdAndUpdate(user.id, {
      lastLogin: new Date()
    });

    // Generate token
    const tokens = await this.authService.generateTokens(
      user.id,
      user.hospitalId,
      user.userType
    );

    return {
      message: 'Login successful',
      data: {
        userId: user.id,
        name: user.name,
        email: user.email,
        userType: user.userType,
        hospitalId: user.hospitalId,
        ...tokens
      }
    };
  }
}