import {
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MinLength
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({ description: 'Text content of the message (min 1 character)' })
  @IsString()
  @MinLength(1)
  content: string;

  @ApiPropertyOptional({
    description:
      'Target chat room UUID (mutually exclusive with groupId / dmThreadId)'
  })
  @IsOptional()
  @IsUUID()
  roomId?: string;

  @ApiPropertyOptional({ description: 'Target group UUID' })
  @IsOptional()
  @IsUUID()
  groupId?: string;

  @ApiPropertyOptional({ description: 'Target DM thread UUID' })
  @IsOptional()
  @IsUUID()
  dmThreadId?: string;

  @ApiPropertyOptional({
    description: 'UUID of the parent message for threaded replies'
  })
  @IsOptional()
  @IsUUID()
  parentMessageId?: string;

  @ApiPropertyOptional({
    description: 'Arbitrary JSON metadata attached to the message'
  })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
