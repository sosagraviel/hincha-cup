import { MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UpdateProjectDto as SharedUpdateProjectDto } from '@livonit/shared';

export class UpdateProjectDto extends SharedUpdateProjectDto {
  @ApiPropertyOptional({ description: 'Project name', maxLength: 255 })
  @MaxLength(255)
  declare name?: string;

  @ApiPropertyOptional({ description: 'Project description', maxLength: 1000 })
  @MaxLength(1000)
  declare description?: string;
}
