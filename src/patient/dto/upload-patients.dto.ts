import { IsString, IsEmail, IsNumber, IsOptional, IsEnum } from 'class-validator';
import { Transform } from 'class-transformer';

export class PatientSpreadsheetData {
  @IsString()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  mobileNo: string;

  @IsNumber()
  @IsOptional()
  age?: number;

  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.toLowerCase();
    }
    return value;
  })
  @IsEnum(['male', 'female', 'other'])
  gender?: string;
}