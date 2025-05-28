import { Controller, Post, Body, Get, UseGuards, Req, Res } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('reset-password')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  // Google Auth
  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Initiate Google OAuth login' })
  async googleAuth() {
    // This will redirect to Google
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Handle Google OAuth callback' })
  @ApiResponse({ status: 200, description: 'Successfully authenticated with Google' })
  @ApiResponse({ status: 401, description: 'Authentication failed' })
  async googleAuthRedirect(@Req() req) {
    try {
      console.log('Google callback received:', req.user);
      
      if (!req.user) {
        throw new Error('No user data received from Google');
      }

      const result = await this.authService.socialLogin(req.user);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('Google callback error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Facebook Auth
  @Get('facebook')
  @UseGuards(AuthGuard('facebook'))
  @ApiOperation({ summary: 'Initiate Facebook OAuth login' })
  async facebookAuth() {}

  @Get('facebook/callback')
  @UseGuards(AuthGuard('facebook'))
  @ApiOperation({ summary: 'Handle Facebook OAuth callback' })
  @ApiResponse({ status: 200, description: 'Successfully authenticated with Facebook' })
  @ApiResponse({ status: 401, description: 'Authentication failed' })
  async facebookAuthRedirect(@Req() req) {
    try {
      if (!req.user) {
        throw new Error('No user data received from Facebook');
      }

      const result = await this.authService.socialLogin(req.user);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error('Facebook callback error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}