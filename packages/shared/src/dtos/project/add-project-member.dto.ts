import { IsEnum, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ProjectRole } from '../../enums';

export class AddProjectMemberDto {
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @IsEnum(ProjectRole)
  @IsOptional()
  role?: ProjectRole = ProjectRole.MEMBER;
}
