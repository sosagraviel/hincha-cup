import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateCommentDto {
  @ApiProperty({ description: 'Replacement comment text (min 1 character)' })
  @IsString()
  @MinLength(1)
  content: string;
}
