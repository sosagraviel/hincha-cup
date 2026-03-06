import { IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class StartDmDto {
  @ApiProperty({
    description: 'UUID of the user to start or retrieve a DM thread with'
  })
  @IsUUID()
  otherUserId: string;
}
