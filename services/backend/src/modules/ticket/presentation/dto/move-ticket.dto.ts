import { ApiProperty } from '@nestjs/swagger';
import {
  MoveTicketDto as SharedMoveTicketDto,
  TicketStatus
} from '@livonit/shared';

export class MoveTicketDto extends SharedMoveTicketDto {
  @ApiProperty({ enum: TicketStatus, description: 'Target status/column' })
  declare status: TicketStatus;

  @ApiProperty({
    description: 'Display order within the column (0-based)',
    example: 0
  })
  declare order: number;
}
