import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { OrgRole } from '@livonit/shared';

export class UpdateMemberRoleDto {
  @ApiProperty({
    enum: OrgRole,
    description: 'New role to assign to the member'
  })
  @IsEnum(OrgRole)
  role: OrgRole;
}
