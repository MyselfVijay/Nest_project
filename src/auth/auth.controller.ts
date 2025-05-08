import { Controller, Post, Body, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
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