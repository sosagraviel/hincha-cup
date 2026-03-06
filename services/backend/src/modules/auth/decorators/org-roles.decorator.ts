import { SetMetadata } from '@nestjs/common';

export const ORG_ROLES_KEY = 'org_roles';

/**
 * Sets required organization-level roles on a route handler. Used with OrgMemberGuard
 * to restrict access based on the user's role within the target organization.
 *
 * @example
 * @OrgRoles('owner', 'admin')
 * @UseGuards(JwtAuthGuard, OrgMemberGuard)
 * @Patch('organizations/:orgId')
 * async updateOrg() { ... }
 */
export const OrgRoles = (...roles: string[]) =>
  SetMetadata(ORG_ROLES_KEY, roles);
