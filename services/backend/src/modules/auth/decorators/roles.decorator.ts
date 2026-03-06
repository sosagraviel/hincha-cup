import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Sets required Keycloak realm roles on a route handler. Used with RolesGuard
 * to restrict access to users with specific realm-level roles.
 *
 * @example
 * @Roles('super_admin')
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Delete('users/:id')
 * async deleteUser() { ... }
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
