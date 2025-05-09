import { IsString, IsNotEmpty, IsDateString } from 'class-validator';

export class CreateHealthRecordDto {
  @IsString()
  @IsNotEmpty()
  diagnosis: string;

  @IsString()
  @IsNotEmpty()
  prescription: string;

  @IsString()
  @IsNotEmpty()
  notes: string;

  @IsDateString()
  visitDate: string;
}