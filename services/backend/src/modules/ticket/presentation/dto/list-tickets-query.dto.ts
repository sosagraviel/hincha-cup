import {
  IsOptional,
  IsEnum,
  IsUUID,
  IsInt,
  IsString,
  Min,
  Max
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { TicketStatus, Priority } from '@livonit/shared';

export class ListTicketsQueryDto {
  @ApiPropertyOptional({ description: 'Page number (1-based)', minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({
    description: 'Results per page (max 100)',
    minimum: 1,
    maximum: 100
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Sort field, e.g. createdAt:DESC' })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({
    enum: TicketStatus,
    description: 'Filter by ticket status'
  })
  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @ApiPropertyOptional({ description: 'Filter by assignee UUID' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ enum: Priority, description: 'Filter by priority' })
  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;
}
