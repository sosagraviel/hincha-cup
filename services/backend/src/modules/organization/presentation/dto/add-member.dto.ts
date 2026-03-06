import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrgRole } from '@livonit/shared';

export class AddMemberDto {
  @ApiProperty({ description: 'UUID of the user to add' })
  @IsUUID()
  userId: string;

  @ApiPropertyOptional({
    enum: OrgRole,
    description: 'Role to assign (defaults to member)'
  })
  @IsOptional()
  @IsEnum(OrgRole)
  role?: OrgRole;
}
