import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Redis } from 'ioredis';
import { MailerService } from '@nestjs-modules/mailer';
import * as bcrypt from 'bcrypt';

@Injectable()
export class PatientService {
  private readonly redis: Redis;

  constructor(
    @InjectModel('User') private userModel: Model<any>,
    private mailerService: MailerService
  ) {
    this.redis = new Redis({
      host: 'precious-newt-10949.upstash.io',
      port: 6379,
      password: 'ASrFAAIjcDFlNmI0MGMxOTczN2E0ZmMwYWZhNGJiNWUzMWE0NTE3M3AxMA',
      tls: {
        rejectUnauthorized: false
      },
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3
    });

    this.redis.on('error', (err) => {
      console.error('Redis connection error:', err);
    });

    this.redis.on('connect', () => {
      console.log('Successfully connected to Redis');
    });
  }

  async sendOtp(sendOtpDto: any) {
    try {
      const { email } = sendOtpDto;
      
      if (!email) {
        return { 
          status: 400,
          message: 'Email is required'
        };
      }
      
      // Check attempt count
      const attempts = await this.redis.get(`attempts:${email}`).catch(err => {
        console.error('Redis error:', err);
        return '0';
      }) || '0';

      if (parseInt(attempts) >= 3) {
        return {
          status: 429, // Too Many Requests
          message: 'Maximum OTP attempts reached. Please try again after 30 minutes'
        };
      }

      // Check if an OTP was recently sent
      const lastOtpTime = await this.redis.get(`lastOtp:${email}`).catch(err => {
        console.error('Redis error:', err);
        return null;
      });

      if (lastOtpTime) {
        const timeElapsed = Date.now() - parseInt(lastOtpTime);
        if (timeElapsed < 60000) { // 1 minute cooldown
          return {
            status: 429, // Too Many Requests
            message: 'Please wait 1 minute before requesting another OTP'
          };
        }
      }

      // First check if user exists
      const user = await this.userModel.findOne({ email });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      const expiryTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
      
      // Store OTP details in Redis
      await this.redis.multi()
        .set(`otp:${email}`, otp, 'EX', 600) // 10 minutes expiry
        .set(`lastOtp:${email}`, Date.now().toString(), 'EX', 1800) // 30 minutes tracking
        .incr(`attempts:${email}`)
        .expire(`attempts:${email}`, 1800) // Reset attempts after 30 minutes
        .exec();

      // Update MongoDB (as backup and for audit)
      const updatedUser = await this.userModel.findOneAndUpdate(
        { email },
        { 
          $set: {
            resetPasswordOtp: otp,
            resetPasswordOtpExpiry: expiryTime
          }
        },
        { new: true }
      );

      if (!updatedUser) {
        throw new Error('Failed to update OTP');
      }

      // Send email
      await this.mailerService.sendMail({
        to: email,
        subject: 'Password Reset OTP',
        text: `Your OTP for password reset is: ${otp}\nThis OTP will expire in 10 minutes.`,
      });
      
      return { 
        status: 200,
        message: 'OTP sent successfully' 
      };
    } catch (error) {
      console.error('Error sending OTP:', error);
      return {
        status: error instanceof NotFoundException ? 404 : 500,
        message: error instanceof NotFoundException ? error.message : 'Failed to send OTP. Please try again later'
      };
    }
  }

  async resetPassword(resetPasswordDto: any) {
    try {
      const { email, otp, newPassword } = resetPasswordDto;
      
      // Validate email format
      if (!email || !email.includes('@')) {
        return {
          statusCode: 400,
          message: 'Please provide a valid email address'
        };
      }
  
      // Validate password strength
      if (!newPassword || newPassword.length < 8 || 
          !/[A-Z]/.test(newPassword) || 
          !/[a-z]/.test(newPassword) || 
          !/[0-9]/.test(newPassword) || 
          !/[!@#$%^&*]/.test(newPassword)) {
        return {
          statusCode: 400,
          message: 'Password must be at least 8 characters long and contain uppercase, lowercase, numbers and special characters'
        };
      }
  
      // Check if user exists
      const user = await this.userModel.findOne({ email });
      if (!user) {
        return {
          statusCode: 404,
          message: 'Email not found. Please check your email address'
        };
      }
  
      // Check Redis for OTP
      const storedOtp = await this.redis.get(`otp:${email}`);
      if (!storedOtp) {
        return {
          statusCode: 400,
          message: 'OTP has expired. Please request a new one'
        };
      }
  
      if (storedOtp !== otp) {
        // Increment failed attempts
        await this.redis.incr(`failedAttempts:${email}`);
        const failedAttempts = await this.redis.get(`failedAttempts:${email}`) || '0';
        const attempts = parseInt(failedAttempts);
        
        if (attempts >= 3) {
          // Lock account for 30 minutes
          await this.redis.setex(`locked:${email}`, 1800, 'true');
          return {
            statusCode: 429,
            message: 'Too many invalid attempts. Account is locked for 30 minutes'
          };
        }
        
        return {
          statusCode: 400,
          message: `Invalid OTP. ${3 - attempts} attempts remaining`
        };
      }
  
      // Hash and update password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await this.userModel.updateOne({ email }, { password: hashedPassword });
  
      // Clear OTP and attempts after successful reset
      await this.redis.del(`otp:${email}`);
      await this.redis.del(`failedAttempts:${email}`);
  
      return {
        statusCode: 200,
        message: 'Password reset successful'
      };
  
    } catch (error) {
      console.error('Password reset error:', error);
      return {
        statusCode: 500,
        message: 'An error occurred while resetting password. Please try again'
      };
    }
  }

  async create(createPatientDto: any) {
    const createdPatient = new this.userModel({
      ...createPatientDto,
      userType: 'patient'
    });
    return createdPatient.save();
  }

  async findAll() {
    return this.userModel.find({ userType: 'patient' }).exec();
  }

  async findOne(id: string) {
    const patient = await this.userModel.findById(id).exec();
    if (!patient) {
      throw new NotFoundException('Patient not found');
    }
    return patient;
  }

  async update(id: string, updatePatientDto: any) {
    const updatedPatient = await this.userModel
      .findByIdAndUpdate(id, updatePatientDto, { new: true })
      .exec();
    if (!updatedPatient) {
      throw new NotFoundException('Patient not found');
    }
    return updatedPatient;
  }

  async remove(id: string) {
    const deletedPatient = await this.userModel
      .findByIdAndDelete(id)
      .exec();
    if (!deletedPatient) {
      throw new NotFoundException('Patient not found');
    }
    return deletedPatient;
  }
}