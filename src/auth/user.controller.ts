import { Controller, Delete, Param, UseGuards, Req, HttpException, HttpStatus, Get, Query } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../schemas/user.schema';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { ExpressRequest } from './interfaces/express-request.interface';

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
} 