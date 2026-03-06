import { IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({ description: 'Display name for the user' })
  @IsOptional()
  @IsString()
  fullName?: string;

  @ApiPropertyOptional({
    description: 'URL of the profile picture; pass null to remove',
    nullable: true
  })
  @IsOptional()
  @IsString()
  profilePictureUrl?: string | null;
}
