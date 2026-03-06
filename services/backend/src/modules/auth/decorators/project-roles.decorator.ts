import { SetMetadata } from '@nestjs/common';

export const PROJECT_ROLES_KEY = 'project_roles';

/**
 * Sets required project-level roles on a route handler. Used with ProjectMemberGuard
 * to restrict access based on the user's role within the target project.
 *
 * @example
 * @ProjectRoles('admin')
 * @UseGuards(JwtAuthGuard, ProjectMemberGuard)
 * @Delete('projects/:projectId')
 * async deleteProject() { ... }
 */
export const ProjectRoles = (...roles: string[]) =>
  SetMetadata(PROJECT_ROLES_KEY, roles);
