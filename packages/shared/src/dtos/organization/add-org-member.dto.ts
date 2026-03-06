import { IsEmail, IsEnum, IsNotEmpty, IsOptional } from 'class-validator';
import { OrgRole } from '../../enums';

export class AddOrgMemberDto {
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsEnum(OrgRole)
  @IsOptional()
  role?: OrgRole = OrgRole.MEMBER;
}
