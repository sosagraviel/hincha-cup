import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Parameter decorator that extracts the authenticated User entity from the request.
 * Requires AuthMiddleware to have populated `request.auth.user` and JwtAuthGuard
 * to have validated the token exists.
 *
 * @example
 * @UseGuards(JwtAuthGuard)
 * @Get('me')
 * async getProfile(@CurrentUser() user: User) {
 *   return user;
 * }
 */
export const CurrentUser = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.auth?.user;
  }
);
