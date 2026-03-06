import { MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  UpdateTicketDto as SharedUpdateTicketDto,
  Priority
} from '@livonit/shared';

export class UpdateTicketDto extends SharedUpdateTicketDto {
  @ApiPropertyOptional({
    description: 'Short summary of the ticket',
    maxLength: 255
  })
  @MaxLength(255)
  declare title?: string;

  @ApiPropertyOptional({
    description: 'Detailed description (supports markdown)'
  })
  declare description?: string;

  @ApiPropertyOptional({ enum: Priority, description: 'Priority level' })
  declare priority?: Priority;

  @ApiPropertyOptional({
    description: 'UUID of the user to assign; pass null to unassign',
    nullable: true
  })
  declare assigneeId?: string | null;

  @ApiPropertyOptional({
    description: 'ISO 8601 due date string; pass null to clear',
    example: '2025-12-31',
    nullable: true
  })
  declare dueDate?: string | null;
}
