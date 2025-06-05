import { Controller, Post, Body, UseGuards, BadRequestException, UseFilters, Inject, Logger, UnauthorizedException } from '@nestjs/common';
import { TokenBlockGuard } from '../token/token-block.guard';
import { TokenBlockFilter } from '../token/token-block.filter';
import { BlockToken } from '../token/token-block.decorator';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../schemas/user.schema';
import { RedisService } from '../payment/redis.service';
import { MailerService } from '@nestjs-modules/mailer';
import * as bcrypt from 'bcrypt';

interface UpdateFields {
  name?: string;
  phone?: string;
  address?: string;
  specialization?: string;
  hospitalId?: string;
  // Add other optional fields that can be updated
}

interface SendOtpDto {
  email: string;
  purpose: 'password_reset' | 'update_details';
  updateFields?: Partial<UpdateFields>; // Only the fields user wants to update
}

interface OtpData {
  otp: string;
  expiry: Date;
  purpose: 'password_reset' | 'update_details';
  updateFields?: Partial<UpdateFields>;
  userType: 'doctor' | 'patient'; // Make userType required
}

interface UserInfo {
  email: string;
  userType: 'doctor' | 'patient';
  isBoth?: boolean;
}

@Controller('auth')
@UseGuards(TokenBlockGuard)
@UseFilters(TokenBlockFilter)
export class OtpController {
  private readonly logger = new Logger(OtpController.name);
  private readonly OTP_EXPIRY_MINUTES = 15; // Increased from 10 to 15 minutes

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private readonly redisService: RedisService,
    private readonly mailerService: MailerService
  ) {}

  @Post('send-otp')
  @BlockToken({ reason: 'Suspicious OTP request activity' })
  async sendOtp(@Body() sendOtpDto: SendOtpDto) {
    const { email, purpose, updateFields } = sendOtpDto;
    this.logger.debug(`[sendOtp] Processing OTP request for email: ${email}`);

    // Validate email format
    if (!this.isValidEmail(email)) {
      throw new BadRequestException('Invalid email format');
    }

    // Check if user exists and get user type(s)
    const userInfo = await this.findUserByEmail(email);
    this.logger.debug(`[sendOtp] User lookup result: ${JSON.stringify(userInfo)}`);

    if (!userInfo) {
      throw new BadRequestException('User not found');
    }

    // If email exists in both collections, require userType
    if (userInfo.isBoth) {
      throw new BadRequestException({
        message: 'Email found in both doctor and patient accounts',
        code: 'MULTIPLE_ACCOUNTS',
        details: 'Please specify your account type (doctor/patient) in the request'
      });
    }

    // Generate OTP
    const otp = this.generateOtp();
    const otpExpiry = new Date(Date.now() + this.OTP_EXPIRY_MINUTES * 60 * 1000);
    this.logger.debug(`[sendOtp] Generated OTP: ${otp}`);
    this.logger.debug(`[sendOtp] OTP expiry: ${otpExpiry.toISOString()}`);

    // Store OTP in Redis with purpose and update fields
    const otpData: OtpData = {
      otp,
      expiry: otpExpiry,
      purpose,
      updateFields,
      userType: userInfo.userType
    };
    await this.storeOtp(email, otpData);

    // Send OTP via email
    await this.sendOtpEmail(email, otp, purpose);

    return {
      message: 'OTP sent successfully',
      purpose,
      expiry: otpExpiry,
      expiryMinutes: this.OTP_EXPIRY_MINUTES
    };
  }

  @Post('reset-password')
  @BlockToken({ reason: 'Suspicious password reset activity' })
  async resetPassword(
    @Body() resetPasswordDto: {
      email: string;
      otp: string;
      newPassword: string;
      userType: 'doctor' | 'patient';
    }
  ) {
    const { email, otp, newPassword, userType } = resetPasswordDto;
    this.logger.debug(`Processing password reset for email: ${email}`);

    // Verify OTP
    const storedOtpData = await this.verifyOtp(email, otp);
    this.logger.debug(`OTP verification result: ${JSON.stringify(storedOtpData)}`);

    if (!storedOtpData) {
      throw new UnauthorizedException('OTP not found or has expired');
    }

    if (storedOtpData.purpose !== 'password_reset') {
      throw new UnauthorizedException('Invalid OTP purpose');
    }

    // Verify user type matches
    if (storedOtpData.userType !== userType) {
      throw new UnauthorizedException('Invalid user type for this account');
    }

    // Update password
    await this.updatePassword(email, newPassword, userType);

    // Clear OTP from Redis
    await this.clearOtp(email);

    return {
      message: 'Password reset successful'
    };
  }

  @Post('update-details')
  @BlockToken({ reason: 'Suspicious details update activity' })
  async updateDetails(
    @Body() updateDetailsDto: {
      email: string;
      otp: string;
      updateFields?: Partial<UpdateFields>; // Make updateFields optional in DTO
    }
  ) {
    const { email, otp, updateFields } = updateDetailsDto;

    // Verify OTP
    const storedOtpData = await this.verifyOtp(email, otp);
    if (!storedOtpData || storedOtpData.purpose !== 'update_details') {
      throw new BadRequestException('Invalid or expired OTP');
    }

    // Use either the stored update fields or the ones provided in the request
    const fieldsToUpdate = updateFields || storedOtpData.updateFields;

    if (!fieldsToUpdate || Object.keys(fieldsToUpdate).length === 0) {
      throw new BadRequestException('No fields specified for update');
    }

    // Update user details using the stored userType
    await this.updateUserDetails(email, fieldsToUpdate, storedOtpData.userType);

    // Clear OTP from Redis
    await this.clearOtp(email);

    return {
      message: 'Details updated successfully',
      updatedFields: Object.keys(fieldsToUpdate)
    };
  }

  // Helper methods
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private generateOtp(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private async findUserByEmail(email: string): Promise<UserInfo | null> {
    this.logger.debug(`Looking up user with email: ${email}`);
    
    // Check both doctor and patient collections
    const doctor = await this.userModel.findOne({ email, userType: 'doctor' }).exec();
    const patient = await this.userModel.findOne({ email, userType: 'patient' }).exec();
    
    this.logger.debug(`Doctor lookup result: ${JSON.stringify(doctor)}`);
    this.logger.debug(`Patient lookup result: ${JSON.stringify(patient)}`);

    if (!doctor && !patient) {
      this.logger.debug('No user found in either collection');
      return null;
    }

    if (doctor && patient) {
      this.logger.debug('User found in both collections');
      return {
        email,
        userType: 'doctor', // Default type, will be overridden if user specifies
        isBoth: true
      };
    }

    const userType = doctor ? 'doctor' : 'patient';
    this.logger.debug(`User found as ${userType}`);
    return {
      email,
      userType
    };
  }

  private async storeOtp(email: string, data: OtpData) {
    try {
      const key = `otp:${email.toLowerCase()}`; // Normalize email to lowercase
      this.logger.debug(`[storeOtp] Starting OTP storage for email: ${email}`);
      this.logger.debug(`[storeOtp] Redis key: ${key}`);
      this.logger.debug(`[storeOtp] OTP data to store: ${JSON.stringify(data)}`);
      
      // Store the OTP data
      const result = await this.redisService.set(key, JSON.stringify(data), this.OTP_EXPIRY_MINUTES * 60);
      this.logger.debug(`[storeOtp] Redis set result: ${result}`);
      
      // Immediately verify the data was stored correctly
      const stored = await this.redisService.get(key);
      this.logger.debug(`[storeOtp] Verification - Retrieved from Redis: ${stored}`);
      
      if (!stored) {
        throw new Error('Failed to verify OTP storage');
      }
      
      const parsedStored = JSON.parse(stored);
      this.logger.debug(`[storeOtp] Parsed stored data: ${JSON.stringify(parsedStored)}`);
      
      if (parsedStored.otp !== data.otp) {
        throw new Error('OTP verification failed - stored OTP does not match');
      }
      
      this.logger.debug(`[storeOtp] OTP successfully stored and verified`);
    } catch (error) {
      this.logger.error(`[storeOtp] Error storing OTP: ${error.message}`);
      throw new BadRequestException('Failed to store OTP: ' + error.message);
    }
  }

  private async verifyOtp(email: string, otp: string): Promise<OtpData | null> {
    try {
      const key = `otp:${email.toLowerCase()}`; // Normalize email to lowercase
      this.logger.debug(`[verifyOtp] Starting OTP verification for email: ${email}`);
      this.logger.debug(`[verifyOtp] Redis key: ${key}`);
      this.logger.debug(`[verifyOtp] Input OTP: ${otp}`);

      // Get the stored OTP data
      const data = await this.redisService.get(key);
      this.logger.debug(`[verifyOtp] Raw data from Redis: ${data}`);

      if (!data) {
        this.logger.debug(`[verifyOtp] No OTP data found in Redis for key: ${key}`);
        return null;
      }

      // Parse the stored data
      let otpData: OtpData;
      try {
        otpData = JSON.parse(data);
        this.logger.debug(`[verifyOtp] Parsed OTP data: ${JSON.stringify(otpData)}`);
      } catch (parseError) {
        this.logger.error(`[verifyOtp] Failed to parse OTP data: ${parseError.message}`);
        return null;
      }

      // Verify OTP match
      if (otpData.otp !== otp) {
        this.logger.debug(`[verifyOtp] OTP mismatch - Expected: ${otpData.otp}, Received: ${otp}`);
        return null;
      }

      // Check expiry
      const now = new Date();
      const expiry = new Date(otpData.expiry);
      this.logger.debug(`[verifyOtp] Checking expiry - Now: ${now.toISOString()}, Expiry: ${expiry.toISOString()}`);

      if (now > expiry) {
        this.logger.debug(`[verifyOtp] OTP has expired`);
        return null;
      }

      // Verify purpose and userType
      this.logger.debug(`[verifyOtp] Verifying purpose: ${otpData.purpose}`);
      this.logger.debug(`[verifyOtp] Verifying userType: ${otpData.userType}`);

      this.logger.debug(`[verifyOtp] OTP verification successful`);
      return otpData;
    } catch (error) {
      this.logger.error(`[verifyOtp] Error verifying OTP: ${error.message}`);
      throw new BadRequestException('Failed to verify OTP: ' + error.message);
    }
  }

  private async clearOtp(email: string) {
    try {
      const key = `otp:${email.toLowerCase()}`; // Normalize email to lowercase
      this.logger.debug(`[clearOtp] Clearing OTP for email: ${email}`);
      this.logger.debug(`[clearOtp] Redis key: ${key}`);
      
      const result = await this.redisService.del(key);
      this.logger.debug(`[clearOtp] Redis delete result: ${result}`);
      
      // Verify the OTP was cleared
      const verify = await this.redisService.get(key);
      this.logger.debug(`[clearOtp] Verification - Retrieved after clear: ${verify}`);
      
      if (verify) {
        this.logger.warn(`[clearOtp] OTP was not properly cleared for key: ${key}`);
      } else {
        this.logger.debug(`[clearOtp] OTP successfully cleared`);
      }
    } catch (error) {
      this.logger.error(`[clearOtp] Error clearing OTP: ${error.message}`);
      // Don't throw here as this is a cleanup operation
    }
  }

  private async sendOtpEmail(email: string, otp: string, purpose: string) {
    const subject = purpose === 'password_reset' ? 'Password Reset OTP' : 'Update Details OTP';
    const text = `Your OTP for ${purpose} is: ${otp}. This OTP will expire in ${this.OTP_EXPIRY_MINUTES} minutes.`;
    
    this.logger.debug(`Sending OTP email to ${email}`);
    await this.mailerService.sendMail({
      to: email,
      subject,
      text
    });
  }

  private async updatePassword(email: string, newPassword: string, userType: string) {
    // Hash the new password
    const salt = await bcrypt.genSalt();
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Update the user's password
    await this.userModel.updateOne(
      { email, userType },
      { $set: { password: hashedPassword } }
    ).exec();
  }

  private async updateUserDetails(email: string, updateFields: Partial<UpdateFields>, userType: string) {
    await this.userModel.updateOne(
      { email, userType },
      { $set: updateFields }
    ).exec();
  }
} 