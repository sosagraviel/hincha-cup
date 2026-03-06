import { IsEnum, IsNotEmpty, IsNumber } from 'class-validator';
import { TicketStatus } from '../../enums';

export class MoveTicketDto {
  @IsEnum(TicketStatus)
  @IsNotEmpty()
  status: TicketStatus;

  @IsNumber()
  @IsNotEmpty()
  order: number;
}
