import {
  IsEmail,
  IsString,
  IsOptional,
  IsBoolean,
} from 'class-validator';

export class InviteUserDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  password?: string;

  @IsBoolean()
  @IsOptional()
  passwordTemporary?: boolean = true;

  @IsString()
  @IsOptional()
  role?: string;
}
