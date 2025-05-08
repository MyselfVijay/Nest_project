import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateHospitalDto {
  @ApiProperty({ example: 'City General Hospital' })
  @IsString({ message: 'Name must be text' })
  @IsNotEmpty({ message: 'Name cannot be empty' })
  name: string;

  @ApiProperty({ example: 'HOSP001' })
  @IsString({ message: 'Hospital ID must be text' })
  @IsNotEmpty({ message: 'Hospital ID cannot be empty' })
  hospitalId: string;
}