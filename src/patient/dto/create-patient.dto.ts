import { IsEmail, IsString, MinLength, IsDate, Matches, IsNotEmpty } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePatientDto {
  @ApiProperty({ example: 'John Doe', description: 'Full name of the patient' })
  @IsString({ message: 'Name must be text' })
  @IsNotEmpty({ message: 'Name cannot be empty' })
  @MinLength(2, { message: 'Name must be at least 2 characters long' })
  name: string;

  @ApiProperty({ example: 'patient@example.com', description: 'Valid email address' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  @IsEmail({}, { 
    message: 'Invalid email format. Email must contain @ and domain (e.g., .com, .org). Example: patient@example.com'
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

  @ApiProperty({ example: '1234567890', description: '10-digit mobile number' })
  @IsString({ message: 'Mobile number must be text' })
  @IsNotEmpty({ message: 'Mobile number cannot be empty' })
  @Matches(/^[6-9]\d{9}$/, { 
    message: 'Mobile number must be exactly 10 digits starting with 6-9. Example: 9876543210'
  })
  mobileNo: string;

  @ApiProperty({ example: '1990-01-01', description: 'Date of birth in YYYY-MM-DD format' })
  @Type(() => Date)
  @IsDate({ message: 'Invalid date format. Please use YYYY-MM-DD format' })
  @IsNotEmpty({ message: 'Date of birth cannot be empty' })
  dob: Date;
}