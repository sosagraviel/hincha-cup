import { IsString, IsOptional, IsEnum, IsUUID, IsDateString } from 'class-validator';
import { TicketStatus } from '../../enums';
import { Priority } from '../../enums';

export class UpdateTicketDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(TicketStatus)
  @IsOptional()
  status?: TicketStatus;

  @IsEnum(Priority)
  @IsOptional()
  priority?: Priority;

  @IsUUID()
  @IsOptional()
  assigneeId?: string | null;

  @IsDateString()
  @IsOptional()
  dueDate?: string | null;
}
