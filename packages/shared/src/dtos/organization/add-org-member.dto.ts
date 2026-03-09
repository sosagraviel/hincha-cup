import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { OrgRole } from '../../enums';

export class AddOrgMemberDto {
  @IsUUID()
  userId: string;

  @IsOptional()
  @IsEnum(OrgRole)
  role?: OrgRole;
}
