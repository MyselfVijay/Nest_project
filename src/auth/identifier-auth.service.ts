import { Injectable, UnauthorizedException, BadRequestException, Logger, NotFoundException, HttpException, HttpStatus } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as ExcelJS from 'exceljs';
import { IdentifierUploadDto } from './dto/identifier-upload.dto';
import { IdentifierRegisterDto } from './dto/identifier-register.dto';
import { User } from '../schemas/user.schema';
import { Identifier } from '../schemas/identifier.schema';
import { MailerService } from '@nestjs-modules/mailer';
import * as nodemailer from 'nodemailer';
import { RedisService } from '../payment/redis.service';
import * as bcrypt from 'bcrypt';

interface OtpData {
  otp: string;
  expiresAt: Date;
  data: IdentifierUploadDto;
}

@Injectable()
export class IdentifierAuthService {
  private readonly logger = new Logger(IdentifierAuthService.name);
  private readonly OTP_PREFIX = 'otp:';
  private readonly OTP_EXPIRY = 600; // 10 minutes in seconds

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Identifier.name) private identifierModel: Model<Identifier>,
    private jwtService: JwtService,
    private mailerService: MailerService,
    private redisService: RedisService,
  ) {
    this.logger.log('Email service initialized');
  }

  // Helper to extract string from ExcelJS cell
  private getCellString(cell: any): string {
    if (!cell || cell === null) return '';
    if (typeof cell === 'string') return cell.trim();
    if (typeof cell === 'number') return cell.toString();
    if (typeof cell === 'object') {
      if (cell.text) return cell.text.trim();
      if (cell.richText && Array.isArray(cell.richText)) {
        return cell.richText.map((t: any) => t.text).join('').trim();
      }
      if (cell.formula && cell.result) return cell.result.toString().trim();
    }
    return '';
  }

  async processIdentifierFile(file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    if (!file.originalname.match(/\.(csv|xlsx|xls)$/)) {
      throw new BadRequestException('Only CSV and Excel files are allowed');
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer);
    const worksheet = workbook.worksheets[0];

    const results = {
      processed: 0,
      skipped: 0,
      errors: [] as string[],
    };

    // Read header row to map column names to indices
    const headerRow = worksheet.getRow(1);
    const headers: { [key: string]: number } = {};
    headerRow.eachCell((cell, colNumber) => {
      const headerName = cell.value?.toString()?.trim();
      if (headerName) {
        headers[headerName] = colNumber;
      }
    });

    // Define expected headers
    const requiredHeaders = ['identifier', 'name', 'email', 'mobileNumber'];
    const missingHeaders = requiredHeaders.filter(header => !headers[header]);

    if (missingHeaders.length > 0) {
      throw new BadRequestException(`Missing required headers: ${missingHeaders.join(', ')}`);
    }

    // Start from the second row (data rows)
    for (let i = 2; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      try {
        // Get cell values using header mapping
        const identifierCell = row.getCell(headers['identifier']);
        const nameCell = row.getCell(headers['name']);
        const emailCell = row.getCell(headers['email']);
        const mobileNumberCell = row.getCell(headers['mobileNumber']);

        // Use helper to extract string values
        const identifier = this.getCellString(identifierCell?.value);
        const name = this.getCellString(nameCell?.value);
        const email = this.getCellString(emailCell?.value);
        const mobileNumber = this.getCellString(mobileNumberCell?.value);

        this.logger.debug(`Processing row ${i} (using headers):`, { identifier, name, email, mobileNumber });

        // Validate required fields (using extracted strings)
        if (!identifier || !name || !email || !mobileNumber) {
          results.skipped++;
          results.errors.push(`Row ${i}: Missing required fields`);
          continue;
        }

        // Validate email format
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        if (!emailRegex.test(email)) {
          results.skipped++;
          results.errors.push(`Row ${i}: Invalid email format - ${email}`);
          continue;
        }

        // Validate mobile number format (10 digits)
        if (!mobileNumber.match(/^\d{10}$/)) {
          results.skipped++;
          results.errors.push(`Row ${i}: Invalid mobile number format (must be 10 digits) - ${mobileNumber}`);
          continue;
        }

        // Check if identifier or email already exists in either collection
        const existingIdentifier = await this.identifierModel.findOne({
          $or: [
            { identifier },
            { email }
          ]
        });

        const existingUser = await this.userModel.findOne({
          $or: [
            { identifier },
            { email }
          ]
        });

        if (existingIdentifier || existingUser) {
          results.skipped++;
          results.errors.push(`Row ${i}: ${existingIdentifier?.identifier === identifier || existingUser?.identifier === identifier ? 'Identifier' : 'Email'} already exists`);
          continue;
        }

        // Store in identifier collection
        const identifierData = {
          identifier,
          name,
          email,
          mobileNo: mobileNumber,
          status: 'pending',
          userType: 'patient' // Default to patient for bulk uploads
        };

        await this.identifierModel.create(identifierData);
        this.logger.log(`Identifier data stored for ${email}`);
        results.processed++;

      } catch (error) {
        results.skipped++;
        if (error.code === 11000) {
          results.errors.push(`Row ${i}: ${error.keyValue.email ? 'Email' : 'Identifier'} already exists`);
        } else {
          results.errors.push(`Row ${i}: ${error.message}`);
        }
      }
    }

    this.logger.log(`Processing complete. Processed: ${results.processed}, Skipped: ${results.skipped}`);
    if (results.errors.length > 0) {
      this.logger.warn('Errors encountered:', results.errors);
    }

    return {
      message: 'File processing completed',
      results
    };
  }

  async generateOtp(identifier: string): Promise<{ message: string }> {
    // Find identifier by identifier and check if it's already registered
    const identifierData = await this.identifierModel.findOne({ 
      identifier, 
      status: { $in: ['pending', 'active'] } // Only allow pending or active identifiers
    });
    
    if (!identifierData) {
      throw new NotFoundException('Identifier not found, already registered, or inactive');
    }

    // Generate a consistent 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString().padStart(6, '0');
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // OTP valid for 10 minutes

    const otpData: OtpData = {
      otp,
      expiresAt,
      data: {
        identifier: identifierData.identifier,
        name: identifierData.name,
        email: identifierData.email,
        mobileNumber: identifierData.mobileNo
      }
    };

    // Store OTP in Redis
    const redisKey = `${this.OTP_PREFIX}${identifier}`;
    await this.redisService.set(redisKey, JSON.stringify(otpData), this.OTP_EXPIRY);

    try {
      this.logger.log(`Attempting to send OTP to ${identifierData.email}`);
      
      const mailOptions = {
        to: identifierData.email,
        subject: 'Your OTP for Registration',
        text: `Hello ${identifierData.name},\n\nYour OTP for registration is: ${otp}\nThis OTP is valid for 10 minutes.\n\nIf you did not request this OTP, please ignore this email.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2>Registration OTP</h2>
            <p>Hello ${identifierData.name},</p>
            <p>Your OTP for registration is: <strong>${otp}</strong></p>
            <p>This OTP is valid for 10 minutes.</p>
            <p>If you did not request this OTP, please ignore this email.</p>
          </div>
        `
      };

      const info = await this.mailerService.sendMail(mailOptions);
      
      // Log the OTP for debugging (remove in production)
      this.logger.log(`Generated OTP: ${otp}`);
      this.logger.log(`Preview URL: ${nodemailer.getTestMessageUrl(info)}`);
      this.logger.log(`OTP sent successfully to ${identifierData.email}`);
      
      return { message: 'OTP sent successfully' };
    } catch (error) {
      this.logger.error(`Failed to send OTP to ${identifierData.email}:`, error);
      // Remove OTP from Redis if email fails
      await this.redisService.del(redisKey);
      throw new BadRequestException('Failed to send OTP. Please try again later.');
    }
  }

  async verifyOtp(identifier: string, otp: string): Promise<{ accessToken: string; userData: IdentifierUploadDto }> {
    const redisKey = `${this.OTP_PREFIX}${identifier}`;
    const otpDataString = await this.redisService.get(redisKey);
    
    if (!otpDataString) {
      throw new UnauthorizedException('No OTP found for this identifier');
    }

    const otpData: OtpData = JSON.parse(otpDataString);
    
    // Clean and normalize both OTPs for comparison
    const normalizedStoredOtp = otpData.otp.trim();
    const normalizedInputOtp = otp.trim();
    
    // Log for debugging
    this.logger.log(`Stored OTP: ${normalizedStoredOtp}`);
    this.logger.log(`Input OTP: ${normalizedInputOtp}`);
    
    if (normalizedStoredOtp !== normalizedInputOtp) {
      this.logger.error(`OTP mismatch - Stored: ${normalizedStoredOtp}, Input: ${normalizedInputOtp}`);
      throw new UnauthorizedException('Invalid OTP');
    }

    if (new Date() > new Date(otpData.expiresAt)) {
      await this.redisService.del(redisKey);
      throw new UnauthorizedException('OTP has expired');
    }

    // Check if identifier is still valid
    const identifierData = await this.identifierModel.findOne({ 
      identifier, 
      status: { $in: ['pending', 'active'] }
    });

    if (!identifierData) {
      await this.redisService.del(redisKey);
      throw new UnauthorizedException('Identifier is no longer valid');
    }

    const userData = otpData.data;
    await this.redisService.del(redisKey);

    const payload = { 
      identifier,
      email: userData.email,
      name: userData.name
    };

    return {
      accessToken: this.jwtService.sign(payload),
      userData
    };
  }

  async completeRegistration(
    registerDto: IdentifierRegisterDto,
    accessToken: string,
    hospitalId: string,
  ) {
    try {
      const payload = this.jwtService.verify(accessToken);
      if (payload.identifier !== registerDto.identifier) {
        throw new UnauthorizedException('Invalid access token');
      }

      // Find the identifier and check its current status
      const identifierData = await this.identifierModel.findOne({ 
        identifier: registerDto.identifier,
        status: { $in: ['pending', 'active'] }
      });

      if (!identifierData) {
        throw new UnauthorizedException('Identifier not found, already registered, or inactive');
      }

      // Validate user type
      if (registerDto.userType === 'doctor') {
        throw new BadRequestException('Doctors must register through the doctor registration endpoint');
      }

      // Hash the password
      const hashedPassword = await bcrypt.hash(registerDto.password, 10);

      // Create new user from identifier data and registration data
      const newUser = new this.userModel({
        identifier: identifierData.identifier,
        name: identifierData.name,
        email: identifierData.email,
        mobileNo: identifierData.mobileNo,
        password: hashedPassword, // Use hashed password
        userType: registerDto.userType || 'patient',
        status: 'registered',
        dob: registerDto.dateOfBirth,
        gender: registerDto.gender,
        address: registerDto.address,
        hospitalId,
      });

      try {
        // Save the user
        const savedUser = await newUser.save();

        // Update identifier status to registered
        await this.identifierModel.findOneAndUpdate(
          { _id: identifierData._id },
          { $set: { status: 'registered' } }
        );

        this.logger.log(`User registered successfully with identifier: ${identifierData.identifier}`);
        this.logger.log(`Identifier status updated from ${identifierData.status} to registered`);

        // Add hospitalId to the user data
        const userData = {
          ...registerDto,
          hospitalId,
        };

        return savedUser;
      } catch (error) {
        // If user creation fails, ensure identifier status remains unchanged
        this.logger.error(`Failed to create user: ${error.message}`);
        throw new BadRequestException('Failed to complete registration. Please try again.');
      }
    } catch (error) {
      this.logger.error(`Registration failed: ${error.message}`);
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid access token');
    }
  }

  async deleteIdentifier(identifier: string): Promise<{ message: string }> {
    try {
      // First check if the identifier exists
      const identifierData = await this.identifierModel.findOne({ identifier });
      
      if (!identifierData) {
        throw new NotFoundException('Identifier not found');
      }

      // Check if the identifier is already registered
      if (identifierData.status === 'registered') {
        throw new BadRequestException('Cannot delete a registered identifier');
      }

      // Delete the identifier
      const deletedIdentifier = await this.identifierModel.findOneAndDelete({ 
        identifier,
        status: { $ne: 'registered' } // Only delete if not registered
      });
      
      if (!deletedIdentifier) {
        throw new NotFoundException('Identifier not found or cannot be deleted');
      }

      return {
        message: 'Identifier deleted successfully'
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new HttpException(
        'An error occurred while deleting the identifier',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async deleteIdentifierById(id: string): Promise<{ message: string }> {
    try {
      // First check if the identifier exists
      const identifierData = await this.identifierModel.findById(id);
      
      if (!identifierData) {
        throw new NotFoundException('Identifier not found');
      }

      // Check if the identifier is already registered
      if (identifierData.status === 'registered') {
        throw new BadRequestException('Cannot delete a registered identifier');
      }

      // Delete the identifier
      const deletedIdentifier = await this.identifierModel.findByIdAndDelete(id);
      
      if (!deletedIdentifier) {
        throw new NotFoundException('Identifier not found or cannot be deleted');
      }

      return {
        message: 'Identifier deleted successfully'
      };
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof BadRequestException) {
        throw error;
      }
      throw new HttpException(
        'An error occurred while deleting the identifier',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
} 