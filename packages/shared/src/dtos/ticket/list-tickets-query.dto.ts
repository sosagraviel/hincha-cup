import { IsOptional, IsEnum, IsUUID, IsInt, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { TicketStatus, Priority } from '../../enums';

export class ListTicketsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  sort?: string;

  @IsOptional()
  @IsEnum(TicketStatus)
  status?: TicketStatus;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsEnum(Priority)
  priority?: Priority;
}
