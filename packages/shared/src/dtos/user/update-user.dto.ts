import { IsString, IsOptional, MinLength, IsEnum, IsNotEmpty } from 'class-validator';
import { Transform } from 'class-transformer';
import { UserStatus } from '../../enums';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  @MinLength(3)
  fullName?: string;
}

export class UpdateUserStatusDto {
  @Transform(({ value }) => (value ? ('' + value).toUpperCase() : value))
  @IsEnum(UserStatus)
  @IsNotEmpty()
  status: UserStatus;
}
