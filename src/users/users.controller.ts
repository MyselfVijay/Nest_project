import { Controller, Post, Body, Put, Delete } from '@nestjs/common';
import { UsersService } from './users.service';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateUsernameDto } from './dto/update-username.dto';
import { DeleteUserDto } from './dto/delete-user.dto';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService, private authService: AuthService) {}

  @Post('register')
  async register(@Body() registerDto: RegisterDto) {
    return this.usersService.create(
      registerDto.email,
      registerDto.password,
      registerDto.username
    );
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto.email, loginDto.password);
  }

  @Put('update-username')
  async updateUsername(@Body() updateUsernameDto: UpdateUsernameDto) {
    return this.usersService.updateUsername(
      updateUsernameDto.email,
      updateUsernameDto.newUsername
    );
  }

  @Delete('delete')
  async deleteUser(@Body() deleteUserDto: DeleteUserDto) {
    return this.usersService.deleteUser(deleteUserDto.email);
  }
}