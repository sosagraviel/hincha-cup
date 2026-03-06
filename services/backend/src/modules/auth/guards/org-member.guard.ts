import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ORG_ROLES_KEY } from '@modules/auth/decorators/org-roles.decorator';
import { OrganizationMember } from '@modules/organization/database/models/organization-member.model';
import { BaseMemberGuard } from './base-member.guard';

/**
 * Verifies the authenticated user is a member of the organization identified by
 * `:orgId` or `:id` route param. Optionally checks organization-level roles when
 * combined with @OrgRoles(). Attaches the membership to `request.orgMembership`.
 *
 * @example
 * @UseGuards(JwtAuthGuard, OrgMemberGuard)
 * @OrgRoles('owner', 'admin')
 * @Patch('organizations/:orgId')
 * async updateOrg(@Param('orgId') orgId: string) { ... }
 */
@Injectable()
export class OrgMemberGuard extends BaseMemberGuard {
  protected readonly paramNames = ['orgId', 'id'];
  protected readonly rolesMetadataKey = ORG_ROLES_KEY;
  protected readonly entityName = 'organization';
  protected readonly requestProperty = 'orgMembership';

  constructor(
    reflector: Reflector,
    @InjectRepository(OrganizationMember)
    private readonly memberRepo: Repository<OrganizationMember>
  ) {
    super(reflector);
  }

  protected async findMembership(
    userId: string,
    entityId: string
  ): Promise<OrganizationMember | null> {
    return this.memberRepo.findOne({
      where: { userId, organizationId: entityId }
    });
  }
}
