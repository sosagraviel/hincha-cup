import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateCommentDto {
  @ApiProperty({ description: 'Comment text (min 1 character)' })
  @IsString()
  @MinLength(1)
  content: string;
}
