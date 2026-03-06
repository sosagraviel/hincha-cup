import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '@modules/auth/decorators/roles.decorator';
import { ForbiddenException } from '@libs/exceptions';

/**
 * Checks Keycloak realm roles from the decoded JWT token against roles specified
 * via the @Roles() decorator. Requires JwtAuthGuard to run first. If no roles
 * are specified on the handler, access is granted to any authenticated user.
 *
 * @example
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Roles('super_admin')
 * @Post('tenants')
 * async createTenant() { ... }
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()]
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const token = request.auth?.token;

    if (!token) {
      throw new ForbiddenException('Insufficient permissions');
    }

    const userRoles: string[] = token.realm_access?.roles || [];
    const hasRole = requiredRoles.some(role => userRoles.includes(role));

    if (!hasRole) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
