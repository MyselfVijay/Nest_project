import { Controller, Delete, Param, UseGuards, Req, HttpException, HttpStatus, Get, Query } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { ExpressRequest } from './interfaces/express-request.interface';
import { Post, UseInterceptors, UploadedFile, Headers } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import xlsx from 'node-xlsx';
import * as bcrypt from 'bcrypt';

// Define interface outside the class
interface UploadedUser {
  name: string;
  email: string;
  mobileNo: string;
  userType?: 'patient' | 'doctor';
  hospitalId?: string;
  password?: string;
  dob?: string;
  gender?: 'male' | 'female' | 'other';
  address?: string;
  state?: string;
  country?: string;
  pincode?: string;
  status?: 'pending' | 'active' | 'inactive' | 'registered';
  createdAt?: Date;
  updatedAt?: Date;
}

@Controller('auth/users')
export class UserController {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>
  ) {}

  @Get('search')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('doctor', 'admin')
  async getUserDetails(
    @Req() req: ExpressRequest & { user: { hospitalId: string } },
    @Query('id') id?: string,
    @Query('email') email?: string,
    @Query('identifier') identifier?: string,
    @Query('mobileNo') mobileNo?: string
  ) {
    try {
      const query: any = {};

      // Add search criteria if provided
      if (id) {
        query._id = new Types.ObjectId(id);
      }
      if (email) {
        query.email = email.toLowerCase();
      }
      if (identifier) {
        query.identifier = identifier;
      }
      if (mobileNo) {
        query.mobileNo = mobileNo;
      }

      // If user is not admin, only show users from their hospital
      if (req.user.userType !== 'admin') {
        query.hospitalId = req.user.hospitalId;
      }

      const user = await this.userModel.findOne(query).select('-password');

      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      return {
        message: 'User details retrieved successfully',
        data: user
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Error retrieving user details', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('list')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async getAllUsers(
    @Query('userType') userType?: string,
    @Query('status') status?: string,
    @Query('hospitalId') hospitalId?: string
  ) {
    try {
      const query: any = {};

      if (userType) {
        query.userType = userType;
      }
      if (status) {
        query.status = status;
      }
      if (hospitalId) {
        query.hospitalId = hospitalId;
      }

      const users = await this.userModel.find(query)
        .select('-password')
        .sort({ createdAt: -1 });

      return {
        message: 'Users list retrieved successfully',
        data: users
      };
    } catch (error) {
      throw new HttpException('Error retrieving users list', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('hospital-users')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('doctor', 'admin')
  async getHospitalUsers(
    @Req() req: ExpressRequest & { user: { hospitalId: string } },
    @Query('userType') userType?: string,
    @Query('status') status?: string
  ) {
    try {
      const query: any = {
        hospitalId: req.user.hospitalId
      };

      if (userType) {
        query.userType = userType;
      }
      if (status) {
        query.status = status;
      }

      const users = await this.userModel.find(query)
        .select('-password')
        .sort({ createdAt: -1 });

      return {
        message: 'Hospital users retrieved successfully',
        data: users
      };
    } catch (error) {
      throw new HttpException('Error retrieving hospital users', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  async deleteUser(@Param('id') id: string) {
    try {
      const user = await this.userModel.findByIdAndDelete(id);
      
      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      return {
        message: 'User deleted successfully'
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException('Error deleting user', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('File'))
  @UseGuards(JwtAuthGuard)
  async uploadUsers(
    @UploadedFile() file: Express.Multer.File,
    @Headers('hospital-id') hospitalId: string
  ) {
    try {
      if (!file) {
        throw new HttpException('No file uploaded', HttpStatus.BAD_REQUEST);
      }

      if (!hospitalId) {
        throw new HttpException('Hospital ID is required', HttpStatus.BAD_REQUEST);
      }

      const users: UploadedUser[] = await this.processUploadedFile(file);
      const savedUsers: UserDocument[] = [];
      const errors: string[] = [];
      const duplicates: string[] = [];
      const updates: string[] = [];
      let hasNewData = false;

      for (const userData of users) {
        try {
          // Set default userType as patient if not specified
          if (!userData.userType) {
            userData.userType = 'patient';
          }

          // Validate userType is either patient or doctor
          if (!['patient', 'doctor'].includes(userData.userType)) {
            throw new HttpException(
              'Invalid user type. Must be either "patient" or "doctor"',
              HttpStatus.BAD_REQUEST
            );
          }

          // Add hospital ID to each user
          userData.hospitalId = hospitalId;

          // Check for existing user by email and mobile number
          const existingUser = await this.userModel.findOne({
            $or: [
              { email: userData.email.toLowerCase() },
              { mobileNo: userData.mobileNo }
            ]
          });

          if (existingUser) {
            // Check if the data is exactly the same
            const isIdentical = this.isDataIdentical(existingUser, userData);
            
            if (isIdentical) {
              duplicates.push(`Skipped ${userData.email}: Identical record already exists`);
              continue;
            }

            // Update existing user with new data
            const updateData = { ...userData };
            
            // Only hash password if it's provided in the upload
            if (updateData.password) {
              updateData.password = await bcrypt.hash(updateData.password, 10);
            } else {
              delete updateData.password; // Don't update password if not provided
            }

            // Update the user
            const updatedUser = await this.userModel.findByIdAndUpdate(
              existingUser._id,
              { 
                $set: {
                  ...updateData,
                  updatedAt: new Date()
                }
              },
              { new: true }
            );
            
            if (updatedUser) {
              savedUsers.push(updatedUser);
              updates.push(`Updated existing user: ${userData.email}`);
              hasNewData = true;
            } else {
              errors.push(`Failed to update user ${userData.email}`);
            }
          } else {
            // Create new user
            // Generate random password if not provided
            if (!userData.password) {
              userData.password = Math.random().toString(36).slice(-8);
              errors.push(`Generated random password for user ${userData.email}: ${userData.password}`);
            }

            // Hash the password
            const hashedPassword = await bcrypt.hash(userData.password, 10);

            // Create new user with all fields
            const newUser = await this.userModel.create({
              ...userData,
              password: hashedPassword,
              email: userData.email.toLowerCase(),
              createdAt: new Date(),
              status: 'active'
            });

            savedUsers.push(newUser);
            hasNewData = true;
          }
        } catch (error) {
          errors.push(`Error processing user ${userData.email}: ${error.message}`);
        }
      }

      // If no new data was added or updated
      if (!hasNewData && duplicates.length === users.length) {
        return {
          message: 'No new data to process - all records already exist',
          duplicates,
          errors: errors.length > 0 ? errors : undefined
        };
      }

      return {
        message: hasNewData ? 'Users upload processed successfully' : 'No new users added',
        data: savedUsers.map(user => ({
          _id: user._id,
          name: user.name,
          email: user.email,
          mobileNo: user.mobileNo,
          userType: user.userType,
          status: user.status,
          dob: user.dob,
          gender: user.gender,
          address: user.address,
          state: user.get('state'),
          country: user.get('country'),
          pincode: user.get('pincode')
        })),
        duplicates: duplicates.length > 0 ? duplicates : undefined,
        updates: updates.length > 0 ? updates : undefined,
        errors: errors.length > 0 ? errors : undefined
      };
    } catch (error) {
      throw new HttpException(
        error.message || 'Error processing user upload',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  private async processUploadedFile(file: Express.Multer.File): Promise<UploadedUser[]> {
    try {
      // Parse the Excel file
      const workSheets = xlsx.parse(file.buffer);
      
      // Get the first worksheet
      const worksheet = workSheets[0];
      
      if (!worksheet || !worksheet.data || worksheet.data.length < 2) {
        throw new HttpException('Invalid file format or empty file', HttpStatus.BAD_REQUEST);
      }

      // Get headers from the first row
      const headers = worksheet.data[0].map(header => String(header).toLowerCase());
      
      // Validate required columns
      const requiredColumns = ['name', 'email', 'mobileno'];
      for (const column of requiredColumns) {
        if (!headers.includes(column)) {
          throw new HttpException(
            `Missing required column: ${column}`,
            HttpStatus.BAD_REQUEST
          );
        }
      }

      // Process each row (skip header row)
      const users: UploadedUser[] = [];
      for (let i = 1; i < worksheet.data.length; i++) {
        const row = worksheet.data[i];
        if (row.length === 0 || row.every(cell => !cell)) continue; // Skip empty rows

        const user: UploadedUser = {
          name: String(row[headers.indexOf('name')] || '').trim(),
          email: String(row[headers.indexOf('email')] || '').trim().toLowerCase(),
          mobileNo: String(row[headers.indexOf('mobileno')] || '').trim(),
          userType: String(row[headers.indexOf('usertype')] || 'patient').toLowerCase() as 'patient' | 'doctor',
          // Add additional fields
          password: row[headers.indexOf('password')]?.toString(),
          dob: row[headers.indexOf('dob')]?.toString(),
          gender: row[headers.indexOf('gender')]?.toString() as 'male' | 'female' | 'other',
          address: row[headers.indexOf('address')]?.toString(),
          state: row[headers.indexOf('state')]?.toString(),
          country: row[headers.indexOf('country')]?.toString(),
          pincode: row[headers.indexOf('pincode')]?.toString(),
          status: row[headers.indexOf('status')]?.toString() as 'pending' | 'active' | 'inactive' | 'registered',
          createdAt: row[headers.indexOf('createdat')]?.toString() ? new Date(String(row[headers.indexOf('createdat')] || '')) : undefined,
          updatedAt: row[headers.indexOf('updatedat')]?.toString() ? new Date(String(row[headers.indexOf('updatedat')] || '')) : undefined
        };

        // Validate required fields
        if (!user.name || !user.email || !user.mobileNo) {
          throw new HttpException(
            `Row ${i + 1}: Missing required fields`,
            HttpStatus.BAD_REQUEST
          );
        }

        // Validate email format
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) {
          throw new HttpException(
            `Row ${i + 1}: Invalid email format - ${user.email}`,
            HttpStatus.BAD_REQUEST
          );
        }

        // Validate mobile number (assuming 10 digits)
        if (!/^\d{10}$/.test(user.mobileNo)) {
          throw new HttpException(
            `Row ${i + 1}: Invalid mobile number format - ${user.mobileNo}`,
            HttpStatus.BAD_REQUEST
          );
        }

        // Validate user type
        if (!['patient', 'doctor'].includes(user.userType ?? '')) {
          user.userType = 'patient'; // Default to patient if invalid or not specified
        }

        // Validate date format if dob is provided
        if (user.dob && !this.isValidDate(user.dob)) {
          throw new HttpException(
            `Row ${i + 1}: Invalid date format for DOB. Use YYYY-MM-DD format`,
            HttpStatus.BAD_REQUEST
          );
        }

        // Validate gender if provided
        if (user.gender && !['male', 'female', 'other'].includes(user.gender.toLowerCase())) {
          throw new HttpException(
            `Row ${i + 1}: Invalid gender. Must be 'male', 'female', or 'other'`,
            HttpStatus.BAD_REQUEST
          );
        }

        users.push(user);
      }

      return users;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        'Error processing Excel file: ' + error.message,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  // Helper function to validate date format
  private isValidDate(dateString: string): boolean {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
  }

  // Helper method to check if the data is identical
  private isDataIdentical(existingUser: UserDocument, newData: UploadedUser): boolean {
    const compareFields = ['name', 'email', 'mobileNo', 'userType', 'gender', 'dob', 'address', 'state', 'country', 'pincode'];
    
    return compareFields.every(field => {
      if (field === 'email') {
        return existingUser[field]?.toLowerCase() === newData[field]?.toLowerCase();
      }
      if (field === 'dob' && existingUser[field] && newData[field]) {
        return new Date(existingUser[field]).toISOString().split('T')[0] === 
               new Date(newData[field]).toISOString().split('T')[0];
      }
      return existingUser[field] === newData[field];
    });
  }
}