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
      }
    });
  }

  async sendOtp(sendOtpDto: any) {
    try {
      const { email } = sendOtpDto;
      
      // First check if user exists
      const user = await this.userModel.findOne({ email });
      if (!user) {
        throw new NotFoundException('User not found');
      }

      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      const expiryTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
      
      // Update with correct field names
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

      console.log('OTP stored:', updatedUser.resetPasswordOtp);
      console.log('OTP expiry:', updatedUser.resetPasswordOtpExpiry);
      
      // Send email
      await this.mailerService.sendMail({
        to: email,
        subject: 'Password Reset OTP',
        text: `Your OTP for password reset is: ${otp}\nThis OTP will expire in 10 minutes.`,
      });
      
      return { message: 'OTP sent successfully' };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      console.error('Error sending OTP:', error);
      throw new Error('Failed to send OTP. Please try again later.');
    }
  }

  async resetPassword(resetPasswordDto: any) {
    try {
      const { email, otp, newPassword } = resetPasswordDto;
      
      if (!email || !otp || !newPassword) {
        throw new Error('Email, OTP, and new password are required');
      }

      console.log('Attempting to reset password for email:', email);
      console.log('Current time:', new Date());

      const user = await this.userModel.findOne({ email });
      
      if (!user) {
        throw new Error('User not found');
      }

      console.log('User found, checking OTP...');
      console.log('Stored OTP:', user.resetPasswordOtp);
      console.log('Provided OTP:', otp);
      console.log('OTP Expiry:', user.resetPasswordOtpExpiry);

      if (!user.resetPasswordOtp || !user.resetPasswordOtpExpiry) {
        throw new Error('No OTP request found. Please request a new OTP');
      }

      if (user.resetPasswordOtp !== otp) {
        throw new Error('Invalid OTP');
      }

      if (user.resetPasswordOtpExpiry < new Date()) {
        throw new Error('OTP has expired. Please request a new one');
      }
      
      // Hash the password before saving
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      
      // Clear OTP after use
      user.resetPasswordOtp = undefined;
      user.resetPasswordOtpExpiry = undefined;
      user.password = hashedPassword;
      await user.save();
      
      return { message: 'Password reset successfully' };
    } catch (error) {
      console.error('Password reset error:', error.message);
      throw error;
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