import { IsString, IsOptional, IsEnum, IsUUID, IsDateString, IsNotEmpty } from 'class-validator';
import { TicketStatus } from '../../enums';
import { Priority } from '../../enums';

/**
 * DTO for creating a new ticket - TESTING HOT RELOAD
 */
export class CreateTicketDto {
  @IsString()
  @IsNotEmpty()
  title: string;

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
  assigneeId?: string;

  @IsDateString()
  @IsOptional()
  dueDate?: string;
}
