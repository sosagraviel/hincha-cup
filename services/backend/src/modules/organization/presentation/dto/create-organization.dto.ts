import { MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateOrganizationDto as SharedCreateOrganizationDto } from '@livonit/shared';

export class CreateOrganizationDto extends SharedCreateOrganizationDto {
  @ApiProperty({ description: 'Organization name', maxLength: 255 })
  @MaxLength(255)
  declare name: string;

  @ApiProperty({ description: 'Unique URL-friendly slug', maxLength: 100 })
  @MaxLength(100)
  declare slug: string;

  @ApiPropertyOptional({
    description: 'Organization description',
    maxLength: 1000
  })
  @MaxLength(1000)
  declare description?: string;
}
