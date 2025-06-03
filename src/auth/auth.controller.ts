import { Controller, Post, Body, Get, UseGuards, Req, Res, HttpException, HttpStatus, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { NotFoundException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Response, Request } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RequestUser } from './interfaces/request-user.interface';

interface RequestWithUser extends Request {
  user: RequestUser;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService
  ) {}

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

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Req() req: RequestWithUser) {
    try {
      if (!req.user) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      // You can add token invalidation logic here if needed
      // For example, adding the token to a blacklist or clearing session data

      return {
        message: 'Logged out successfully',
        data: {
          userId: req.user.sub,
          userType: req.user.userType
        }
      };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new HttpException(
        'An error occurred during logout',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  @Post('test/invalidate-token')
  @UseGuards(JwtAuthGuard)
  async testInvalidateToken(@Req() req: Request) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      throw new UnauthorizedException('No token provided');
    }
    
    await this.authService.invalidateToken(token);
    return {
      message: 'Token has been invalidated',
      timestamp: new Date().toISOString()
    };
  }

  @Get('test/check-token')
  @UseGuards(JwtAuthGuard)
  async testCheckToken(@Req() req: Request) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
      throw new UnauthorizedException('No token provided');
    }
    
    const isBlacklisted = await this.authService.isTokenBlacklisted(token);
    return {
      message: isBlacklisted ? 'Token is blacklisted' : 'Token is valid',
      isBlacklisted,
      timestamp: new Date().toISOString()
    };
  }
}