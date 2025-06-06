import { IsEmail, IsString, MinLength, Matches, IsNotEmpty, IsEnum, IsDateString, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateDoctorDto {
  @ApiProperty({ example: 'Dr. Smith', description: 'Full name of the doctor' })
  @IsString({ message: 'Name must be text' })
  @IsNotEmpty({ message: 'Name cannot be empty' })
  @MinLength(2, { message: 'Name must be at least 2 characters long' })
  name: string;

  @ApiProperty({ example: 'doctor@example.com', description: 'Valid email address' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  @IsEmail({}, { 
    message: 'Invalid email format. Email must contain @ and domain (e.g., .com, .org). Example: doctor@example.com'
  })
  @Matches(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, {
    message: 'Email must be properly formatted (e.g., user@domain.com)'
  })
  @IsNotEmpty({ message: 'Email cannot be empty' })
  email: string;

  @ApiProperty({ example: 'Test@123', description: 'Strong password with minimum requirements' })
  @IsString({ message: 'Password must be text' })
  @IsNotEmpty({ message: 'Password cannot be empty' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/, {
    message: 'Password must contain at least one uppercase letter, one lowercase letter, one number and one special character (@$!%*?&)'
  })
  password: string;

  @ApiProperty({ 
      example: 'male', 
      description: 'Gender of the Doctor', 
      enum: ['male', 'female', 'other'] 
    })
    @IsEnum(['male', 'female', 'other'], { 
      message: 'Gender must be one of: male, female, other' 
    })
    @IsNotEmpty({ message: 'Gender cannot be empty' })
    gender: string;


  @ApiProperty({ example: '9876543210', description: 'Valid 10-digit mobile number' })
  @IsString({ message: 'Mobile number must be text' })
  @IsNotEmpty({ message: 'Mobile number cannot be empty' })
  @Matches(/^[6-9]\d{9}$/, {
    message: 'Mobile number must be a valid 10-digit number starting with 6-9'
  })
  mobileNo: string;

  @ApiProperty({ 
    example: '1990-01-01', 
    description: 'Date of Birth in YYYY-MM-DD format',
    required: false
  })
  @IsOptional()
  @IsDateString({}, { 
    message: 'Date of Birth must be a valid date in YYYY-MM-DD format' 
  })
  dob?: string;

  @IsString()
  @IsNotEmpty()
  specialization: string;
}