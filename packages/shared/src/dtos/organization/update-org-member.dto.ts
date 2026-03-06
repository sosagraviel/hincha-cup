import { IsEnum, IsNotEmpty } from 'class-validator';
import { OrgRole } from '../../enums';

export class UpdateOrgMemberDto {
  @IsEnum(OrgRole)
  @IsNotEmpty()
  role: OrgRole;
}
