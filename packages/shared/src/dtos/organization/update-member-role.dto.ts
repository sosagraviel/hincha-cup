import { IsEnum, IsNotEmpty } from 'class-validator';
import { OrgRole } from '../../enums';

export class UpdateMemberRoleDto {
  @IsEnum(OrgRole)
  @IsNotEmpty()
  role: OrgRole;
}
