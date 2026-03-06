import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@libs/exceptions';

/**
 * Validates that a JWT token is present on the request. Must be used after AuthMiddleware
 * which populates `request.auth`. Does NOT check specific roles — use with RolesGuard
 * or OrgMemberGuard for role-based access control.
 *
 * @example
 * @UseGuards(JwtAuthGuard)
 * @Get('profile')
 * async getProfile(@CurrentUser() user: User) { ... }
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    if (!request.auth?.user) {
      throw new UnauthorizedException('Authentication required');
    }
    return true;
  }
}
