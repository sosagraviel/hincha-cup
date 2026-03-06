import { MaxLength, Matches } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateProjectDto as SharedCreateProjectDto } from '@livonit/shared';

export class CreateProjectDto extends SharedCreateProjectDto {
  @ApiProperty({ description: 'Project name', maxLength: 255 })
  @MaxLength(255)
  declare name: string;

  @ApiProperty({
    description: 'Unique project key (uppercase, 2-10 chars)',
    example: 'PROJ',
    maxLength: 10
  })
  @MaxLength(10)
  @Matches(/^[A-Z]{2,10}$/, {
    message: 'Key must be 2-10 uppercase letters'
  })
  declare key: string;

  @ApiPropertyOptional({ description: 'Project description', maxLength: 1000 })
  @MaxLength(1000)
  declare description?: string;
}
