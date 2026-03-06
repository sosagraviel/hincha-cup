import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoomDto {
  @ApiProperty({ description: 'Display name of the chat room', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ description: 'UUID of the organization this room belongs to' })
  @IsUUID()
  organizationId: string;

  @ApiPropertyOptional({
    description: 'Optional room description',
    maxLength: 1000
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Whether all org members can see this room (defaults to true)'
  })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
