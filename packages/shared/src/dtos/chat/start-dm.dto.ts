import { IsUUID } from 'class-validator';

export class StartDmDto {
  @IsUUID()
  otherUserId: string;
}
