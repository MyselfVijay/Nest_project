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
import { MailerService } from '@nestjs-modules/mailer';
import * as crypto from 'crypto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  private readonly maxLoginAttempts = 5;
  private readonly loginLockDuration = 3600; // 1 hour in seconds
  private readonly tokenBlacklistPrefix = 'token_blacklist:';

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private jwtService: JwtService,
    private redisService: RedisService,
    private mailerService: MailerService,
    private configService: ConfigService
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
    const lockedKey = `login_locked:${email}`;
    await this.redisService.del(attemptsKey);
    await this.redisService.del(lockedKey);
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

      // Find user by email without status restriction first
      const user = await this.userModel.findOne({ email: loginDto.email });
      
      // Log user details for debugging
      console.log('Login attempt:', {
        email: loginDto.email,
        foundUser: user ? {
          email: user.email,
          status: user.status,
          userType: user.userType,
          hospitalId: user.hospitalId,
          hasPassword: !!user.password,
          identifier: user.identifier
        } : 'No user found'
      });

      if (!user) {
        const attempts = await this.getLoginAttempts(loginDto.email);
        let message = 'Invalid credentials - Please check your email and password carefully';
        
        if (attempts === 2 || attempts === 3) {
          message = 'Invalid credentials - Please verify your email and password. Make sure caps lock is off';
        } else if (attempts === 4) {
          message = 'Invalid credentials - Warning: One more failed attempt will lock your account for 1 hour';
        }
        
        throw new UnauthorizedException({ message, statusCode: 401 });
      }

      // Log the password verification attempt
      console.log('Attempting password verification:', {
        email: user.email,
        providedPassword: loginDto.password,
        storedPasswordHash: user.password
      });

      // Verify password
      const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
      
      // Log password verification result
      console.log('Password verification:', {
        email: user.email,
        isPasswordValid,
        status: user.status,
        hospitalId: user.hospitalId
      });

      if (!isPasswordValid) {
        const attempts = await this.getLoginAttempts(loginDto.email);
        let message = 'Invalid credentials - Please check your email and password carefully';
        
        if (attempts === 2 || attempts === 3) {
          message = 'Invalid credentials - Please verify your email and password. Make sure caps lock is off';
        } else if (attempts === 4) {
          message = 'Invalid credentials - Warning: One more failed attempt will lock your account for 1 hour';
        }
        
        throw new UnauthorizedException({ message, statusCode: 401 });
      }

      // Handle hospital ID
      let finalHospitalId = user.hospitalId;
      
      // If hospital ID is undefined and hospital code is provided, use the code
      if (!finalHospitalId && loginDto.hospitalCode) {
        finalHospitalId = loginDto.hospitalCode;
        // Update user's hospital ID
        user.hospitalId = finalHospitalId;
        await user.save();
      }
      
      // If still no hospital ID, use default
      if (!finalHospitalId) {
        finalHospitalId = 'HOSP001'; // Default hospital ID
        user.hospitalId = finalHospitalId;
        await user.save();
      }

      // Verify hospital code if provided
      if (loginDto.hospitalCode && finalHospitalId !== loginDto.hospitalCode) {
        throw new UnauthorizedException({
          message: 'Invalid hospital code',
          statusCode: 401
        });
      }

      // Reset attempts on successful login
      await this.resetLoginAttempts(loginDto.email);

      // Update last login time
      user.lastLogin = new Date();
      await user.save();

      const payload = {
        sub: user._id.toString(),
        email: user.email,
        userType: user.userType,
        hospitalId: finalHospitalId,
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
          hospitalId: finalHospitalId,
          lastLogin: Date.now()
        }),
        86400 // 24 hours TTL
      );

      // Log successful login
      console.log('Login successful:', {
        email: user.email,
        status: user.status,
        userType: user.userType,
        hospitalId: finalHospitalId
      });

      return {
        accessToken,
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          userType: user.userType,
          hospitalId: finalHospitalId,
          status: user.status
        }
      };
    } catch (error) {
      console.error('Login error:', {
        error: error.message,
        stack: error.stack
      });
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
    const expiryDate = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
    
    // Store OTP in Redis with metadata
    const otpData = {
      otp,
      expiry: expiryDate.toISOString(),
      purpose: 'password_reset',
      userType: user.userType
    };
    
    await this.redisService.set(`otp:${email}`, JSON.stringify(otpData), 600);
  
    // Send email with OTP
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Password Reset OTP',
        text: `Your OTP for password reset is: ${otp}\nThis OTP will expire in 10 minutes.`,
        html: `
          <h3>Password Reset OTP</h3>
          <p>Your OTP for password reset is: <strong>${otp}</strong></p>
          <p>This OTP will expire in 10 minutes.</p>
        `
      });

      return {
        message: 'Password reset instructions sent to your email',
        statusCode: 200
      };
    } catch (error) {
      // Delete OTP from Redis if email fails
      await this.redisService.del(`otp:${email}`);
      throw new HttpException('Failed to send OTP email', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { email, otp, newPassword } = resetPasswordDto;
    
    // Verify OTP
    const storedOtpData = await this.redisService.get(`otp:${email}`);
    if (!storedOtpData) {
      throw new UnauthorizedException('OTP has expired. Please request a new one');
    }

    // Parse the stored OTP data
    let otpData;
    try {
      otpData = JSON.parse(storedOtpData);
    } catch (error) {
      throw new UnauthorizedException('Invalid OTP format');
    }

    // Check if OTP matches and hasn't expired
    if (!otpData.otp || otpData.otp !== otp) {
      throw new UnauthorizedException('Invalid OTP. Please check and try again');
    }

    // Check if OTP has expired
    const expiryDate = new Date(otpData.expiry);
    if (new Date() > expiryDate) {
      await this.redisService.del(`otp:${email}`);
      throw new UnauthorizedException('OTP has expired. Please request a new one');
    }

    // Find user and verify type
    const user = await this.userModel.findOne({ email });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Validate password strength
    if (newPassword.length < 8 || 
        !/[A-Z]/.test(newPassword) || 
        !/[a-z]/.test(newPassword) || 
        !/[0-9]/.test(newPassword) || 
        !/[!@#$%^&*]/.test(newPassword)) {
      throw new HttpException(
        'Password must be at least 8 characters long and contain uppercase, lowercase, numbers and special characters',
        HttpStatus.BAD_REQUEST
      );
    }
  
    // Update password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await this.userModel.findOneAndUpdate(
      { email },
      { password: hashedPassword }
    );
  
    // Clear OTP
    await this.redisService.del(`otp:${email}`);
  
    return {
      message: 'Password reset successful',
      statusCode: 200,
      userType: user.userType
    };
  }

  async socialLogin(user: any): Promise<{ accessToken: string; user: any }> {
    if (!user) {
      throw new UnauthorizedException('No user from social provider');
    }

    try {
      // Check if user exists
      let existingUser = await this.userModel.findOne({ email: user.email });

      if (!existingUser) {
        // Create new user if doesn't exist
        const newUser = {
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          userType: 'patient', // default type for social login
          password: crypto.randomBytes(32).toString('hex'), // random password
          isEmailVerified: true, // since email is verified by social provider
          hospitalId: 'HOSP001', // default hospital ID for social login
          mobileNo: '0000000000', // default mobile number
          createdAt: new Date(),
          lastLogin: new Date()
        };

        existingUser = await this.userModel.create(newUser);
      } else {
        // Update last login
        existingUser.lastLogin = new Date();
        await existingUser.save();
      }

      // Generate JWT token
      const payload = {
        sub: existingUser._id,
        email: existingUser.email,
        userType: existingUser.userType,
        hospitalId: existingUser.hospitalId
      };

      return {
        accessToken: this.jwtService.sign(payload),
        user: {
          _id: existingUser._id,
          email: existingUser.email,
          name: existingUser.name,
          userType: existingUser.userType,
          hospitalId: existingUser.hospitalId
        }
      };
    } catch (error) {
      console.error('Social login error:', error);
      throw new UnauthorizedException('Failed to process social login');
    }
  }

  async invalidateToken(token: string): Promise<void> {
    const key = this.tokenBlacklistPrefix + token;
    // Store token in Redis with expiration matching JWT expiration
    const decoded = this.jwtService.decode(token) as any;
    const expirationTime = decoded?.exp ? decoded.exp - Math.floor(Date.now() / 1000) : 3600; // Default 1 hour
    await this.redisService.set(key, 'true', expirationTime);
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    const key = this.tokenBlacklistPrefix + token;
    const isBlacklisted = await this.redisService.get(key);
    return isBlacklisted === 'true';
  }

  async logout(token: string): Promise<void> {
    await this.invalidateToken(token);
  }
}