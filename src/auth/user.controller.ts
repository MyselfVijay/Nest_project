import { Controller, Delete, Param, UseGuards, Req, HttpException, HttpStatus } from '@nestjs/common';
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

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'doctor')
  async deleteUser(
    @Param('id') id: string,
    @Req() req: ExpressRequest & { user: { sub: string, hospitalId: string } }
  ) {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new HttpException('Invalid user ID', HttpStatus.BAD_REQUEST);
      }

      // Find the user first to check their type
      const user = await this.userModel.findOne({
        _id: new Types.ObjectId(id),
        hospitalId: req.user.hospitalId
      });

      if (!user) {
        throw new HttpException('User not found', HttpStatus.NOT_FOUND);
      }

      // Check if the current user has permission to delete this type of user
      if (user.userType === 'doctor' && req.user.userType !== 'admin') {
        throw new HttpException('Only admin can delete doctors', HttpStatus.FORBIDDEN);
      }

      // Delete the user
      const deletedUser = await this.userModel.findOneAndDelete({
        _id: new Types.ObjectId(id),
        hospitalId: req.user.hospitalId
      });

      return {
        message: `${user.userType} deleted successfully`
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'An error occurred while deleting the user',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
} 