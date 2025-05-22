import { Injectable, UnauthorizedException, HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { User } from '../schemas/user.schema';
import { LoginDto } from './dto/login.dto';
import * as bcrypt from 'bcrypt';
import { RedisService } from '../payment/redis.service';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

@Injectable()
export class AuthService {
  private readonly maxLoginAttempts = 5;
  private readonly loginLockDuration = 3600; // 1 hour in seconds

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private jwtService: JwtService,
    private redisService: RedisService
  ) {}

  private async checkLoginAttempts(email: string): Promise<void> {
    const attemptsKey = `login_attempts:${email}`;
    const lockedKey = `login_locked:${email}`;

    // Check if user is locked
    const isLocked = await this.redisService.get(lockedKey);
    if (isLocked) {
      throw new HttpException(
        'Account is temporarily locked. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    // Get current attempts
    const attempts = await this.redisService.get(attemptsKey);
    const currentAttempts = attempts ? parseInt(attempts, 10) + 1 : 1;

    // Update attempts
    await this.redisService.set(attemptsKey, currentAttempts.toString(), this.loginLockDuration);

    // Lock account if max attempts exceeded
    if (currentAttempts >= this.maxLoginAttempts) {
      await this.redisService.set(lockedKey, 'true', this.loginLockDuration);
      throw new HttpException(
        'Too many login attempts. Account is locked for 1 hour.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }
  }

  private async resetLoginAttempts(email: string): Promise<void> {
    const attemptsKey = `login_attempts:${email}`;
    await this.redisService.del(attemptsKey);
  }

  private async getLoginAttempts(email: string): Promise<number> {
    const attemptsKey = `login_attempts:${email}`;
    const attempts = await this.redisService.get(attemptsKey);
    return attempts ? parseInt(attempts, 10) : 0;
  }

  async login(loginDto: LoginDto) {
    try {
      // Check login attempts before processing
      await this.checkLoginAttempts(loginDto.email);

      const user = await this.userModel.findOne({ email: loginDto.email });
      if (!user) {
        const attempts = await this.getLoginAttempts(loginDto.email);
        let message = 'Invalid credentials';
        
        if (attempts === 2 || attempts === 3) {
          message = 'Please carefully check your username and password';
        } else if (attempts === 4) {
          message = 'Warning: One more failed attempt will lock your account';
        }
        
        throw new UnauthorizedException({ message, statusCode: 401 });
      }

      const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
      if (!isPasswordValid) {
        const attempts = await this.getLoginAttempts(loginDto.email);
        let message = 'Invalid credentials';
        
        if (attempts === 2 || attempts === 3) {
          message = 'Please carefully check your username and password';
        } else if (attempts === 4) {
          message = 'Warning: One more failed attempt will lock your account';
        }
        
        throw new UnauthorizedException({ message, statusCode: 401 });
      }

      // Reset attempts on successful login
      await this.resetLoginAttempts(loginDto.email);

      const payload = {
        sub: user._id.toString(),
        email: user.email,
        userType: user.userType,
        hospitalId: user.hospitalId,
        iat: Math.floor(Date.now() / 1000)
      };

      const accessToken = this.jwtService.sign(payload);

      // Store session in Redis
      await this.redisService.set(
        `user_session:${user._id}`,
        JSON.stringify({
          userId: user._id,
          email: user.email,
          userType: user.userType,
          lastLogin: Date.now()
        }),
        86400 // 24 hours TTL
      );

      return {
        accessToken,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          userType: user.userType,
          hospitalId: user.hospitalId
        }
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid credentials');
    }
  }

  async generateTokens(userId: string, hospitalId: string, userType: string) {
    const payload = {
      sub: userId,
      hospitalId,
      userType,
      iat: Math.floor(Date.now() / 1000)
    };

    const accessToken = this.jwtService.sign(payload);

    return {
      accessToken
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;
    const user = await this.userModel.findOne({ email });
    
    if (!user) {
      throw new NotFoundException('User not found');
    }
  
    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Store OTP in Redis with 10 minutes expiration
    await this.redisService.set(`reset_otp:${email}`, otp, 600);
  
    // Send email with OTP
    // TODO: Implement email sending logic
  
    return {
      message: 'Password reset instructions sent to your email',
      statusCode: 200
    };
}
  
  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { email, otp, newPassword } = resetPasswordDto;
    
    // Verify OTP
    const storedOtp = await this.redisService.get(`reset_otp:${email}`);
    if (!storedOtp || storedOtp !== otp) {
      throw new UnauthorizedException('Invalid or expired OTP');
    }
  
    // Update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.userModel.findOneAndUpdate(
      { email },
      { password: hashedPassword }
    );
  
    // Clear OTP
    await this.redisService.del(`reset_otp:${email}`);
  
    return {
      message: 'Password reset successful',
      statusCode: 200
    };
  }
}