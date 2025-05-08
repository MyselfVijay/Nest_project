import { IsEmail, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: 'Please enter a valid email' })
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: 'Test@123' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ example: 'HOSP001' })
  @IsString()
  @IsNotEmpty()
  hospitalCode: string;
}