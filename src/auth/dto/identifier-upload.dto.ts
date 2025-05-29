import { IsNotEmpty, IsString } from 'class-validator';

export class IdentifierUploadDto {
  @IsNotEmpty()
  @IsString()
  identifier: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  email: string;

  @IsNotEmpty()
  @IsString()
  mobileNumber: string;
} 