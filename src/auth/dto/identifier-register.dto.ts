import { IsNotEmpty, IsString, IsEmail, IsEnum, IsOptional, Matches, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { Gender } from '../enums/gender.enum';

export class IdentifierRegisterDto {
  @IsNotEmpty({ message: 'Identifier is required' })
  @IsString({ message: 'Identifier must be a string' })
  @Matches(/^[A-Z0-9]+$/, { message: 'Identifier must contain only uppercase letters and numbers' })
  identifier: string;

  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @Matches(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, {
    message: 'Please provide a valid email address'
  })
  email: string;

  @IsNotEmpty({ message: 'Password is required' })
  @IsString({ message: 'Password must be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(30, { message: 'Password must not exceed 30 characters' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    {
      message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    }
  )
  password: string;

  @IsNotEmpty({ message: 'Gender is required' })
  @IsEnum(Gender, { message: 'Gender must be either male or female' })
  gender: Gender;

  @IsNotEmpty({ message: 'Date of birth is required' })
  @Transform(({ value }) => {
      if (typeof value === 'string') {
      const isValidFormat = /^\d{2}\/\d{2}\/\d{4}$/.test(value);
      if (!isValidFormat) {
        throw new Error('Date of birth must be in DD/MM/YYYY format (e.g., 01/01/1990)');
    }

      const [day, month, year] = value.split('/').map(Number);
      const date = new Date(year, month - 1, day);

      // Check if valid calendar date (e.g., not 31/02/1990)
      const isValidDate =
        date.getDate() === day &&
        date.getMonth() === month - 1 &&
        date.getFullYear() === year;

      if (!isValidDate) {
        throw new Error('Invalid date of birth');
      }

      return date;
    }
    return value;
   })
   dateOfBirth: Date;

  @IsNotEmpty({ message: 'Address is required' })
  @IsString({ message: 'Address must be a string' })
  @MinLength(5, { message: 'Address must be at least 5 characters long' })
  @MaxLength(200, { message: 'Address must not exceed 200 characters' })
  address: string;

  @IsOptional()
  @IsEnum(['patient', 'user'], { message: 'userType must be either "patient" or "user"' })
  userType: string = 'patient'; // Default to patient if not specified
} 