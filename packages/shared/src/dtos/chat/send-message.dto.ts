import {
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MinLength
} from 'class-validator';

export class SendMessageDto {
  @IsString()
  @MinLength(1)
  content: string;

  @IsOptional()
  @IsUUID()
  roomId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsOptional()
  @IsUUID()
  dmThreadId?: string;

  @IsOptional()
  @IsUUID()
  parentMessageId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
