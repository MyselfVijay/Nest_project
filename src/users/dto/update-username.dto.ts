import { IsEmail, IsString } from 'class-validator';

export class UpdateUsernameDto {
  @IsEmail()
  email: string;

  @IsString()
  newUsername: string;
}