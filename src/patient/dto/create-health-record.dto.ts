import { IsString, IsNotEmpty, IsOptional, IsDateString } from 'class-validator';

export class CreateHealthRecordDto {
  @IsString()
  @IsNotEmpty({ message: 'Diagnosis is required' })
  diagnosis: string;

  @IsString()
  @IsNotEmpty({ message: 'Prescription is required' })
  prescription: string;

  @IsString()
  @IsNotEmpty({ message: 'Notes are required' })
  notes: string;

  @IsDateString()
  @IsOptional()
  visitDate?: string;
}