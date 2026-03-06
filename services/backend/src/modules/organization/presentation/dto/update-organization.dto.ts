import { MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { UpdateOrganizationDto as SharedUpdateOrganizationDto } from '@livonit/shared';

export class UpdateOrganizationDto extends SharedUpdateOrganizationDto {
  @ApiPropertyOptional({ description: 'Organization name', maxLength: 255 })
  @MaxLength(255)
  declare name?: string;

  @ApiPropertyOptional({
    description: 'Organization description',
    maxLength: 1000
  })
  @MaxLength(1000)
  declare description?: string;
}
