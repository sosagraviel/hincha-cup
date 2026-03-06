import { MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  CreateTicketDto as SharedCreateTicketDto,
  TicketStatus,
  Priority
} from '@livonit/shared';

export class CreateTicketDto extends SharedCreateTicketDto {
  @ApiProperty({ description: 'Short summary of the ticket', maxLength: 255 })
  @MaxLength(255)
  declare title: string;

  @ApiPropertyOptional({
    description: 'Detailed description (supports markdown)'
  })
  declare description?: string;

  @ApiPropertyOptional({
    enum: TicketStatus,
    description: 'Initial status (defaults to backlog)'
  })
  declare status?: TicketStatus;

  @ApiPropertyOptional({ enum: Priority, description: 'Priority level' })
  declare priority?: Priority;

  @ApiPropertyOptional({ description: 'UUID of the user to assign' })
  declare assigneeId?: string;

  @ApiPropertyOptional({
    description: 'ISO 8601 due date string',
    example: '2025-12-31'
  })
  declare dueDate?: string;
}
