import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PROJECT_ROLES_KEY } from '@modules/auth/decorators/project-roles.decorator';
import { ProjectMember } from '@modules/project/database/models/project-member.model';
import { BaseMemberGuard } from './base-member.guard';

/**
 * Verifies the authenticated user is a member of the project identified by
 * `:projectId` or `:id` route param. Optionally checks project-level roles when
 * combined with @ProjectRoles(). Attaches the membership to `request.projectMembership`.
 *
 * @example
 * @UseGuards(JwtAuthGuard, ProjectMemberGuard)
 * @ProjectRoles('admin', 'member')
 * @Post('projects/:projectId/tickets')
 * async createTicket(@Param('projectId') projectId: string) { ... }
 */
@Injectable()
export class ProjectMemberGuard extends BaseMemberGuard {
  protected readonly paramNames = ['projectId', 'id'];
  protected readonly rolesMetadataKey = PROJECT_ROLES_KEY;
  protected readonly entityName = 'project';
  protected readonly requestProperty = 'projectMembership';

  constructor(
    reflector: Reflector,
    @InjectRepository(ProjectMember)
    private readonly memberRepo: Repository<ProjectMember>
  ) {
    super(reflector);
  }

  protected async findMembership(
    userId: string,
    entityId: string
  ): Promise<ProjectMember | null> {
    return this.memberRepo.findOne({
      where: { userId, projectId: entityId }
    });
  }
}
