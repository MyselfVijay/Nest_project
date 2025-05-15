import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import { MailerService } from '@nestjs-modules/mailer';
import { SendOtpDto } from './dto/send-otp.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class PatientService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly mailerService: MailerService
  ) {}

  async sendOtp(sendOtpDto: SendOtpDto) {
    const { email } = sendOtpDto;

    // Find user
    const user = await this.userModel.findOne({ 
      email: email.toLowerCase(),
      userType: 'patient'
    });
    if (!user) {
      throw new NotFoundException('Patient not found');
    }

    // Generate OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Save OTP to user document
    await this.userModel.updateOne(
      { _id: user._id },
      { 
        $set: {
          resetPasswordOtp: otp,
          resetPasswordOtpExpiry: otpExpiry
        }
      }
    );

    // Send email
    await this.mailerService.sendMail({
      to: email,
      subject: 'Password Reset OTP',
      text: `Your OTP for password reset is: ${otp}\nThis OTP will expire in 10 minutes.`
    });

    return {
      message: 'OTP sent successfully',
      data: {
        email
      }
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { email, otp, newPassword } = resetPasswordDto;

    // Find user
    const user = await this.userModel.findOne({
      email: email.toLowerCase(),
      userType: 'patient',
      resetPasswordOtp: otp,
      resetPasswordOtpExpiry: { $gt: new Date() }
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear OTP
    await this.userModel.updateOne(
      { _id: user._id },
      {
        $set: { password: hashedPassword },
        $unset: { resetPasswordOtp: 1, resetPasswordOtpExpiry: 1 }
      }
    );

    return {
      message: 'Password reset successful',
      data: {
        email
      }
    };
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