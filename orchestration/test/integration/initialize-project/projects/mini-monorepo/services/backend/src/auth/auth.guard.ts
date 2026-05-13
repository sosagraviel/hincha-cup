import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ headers: Record<string, string> }>();
    const authHeader = request.headers['authorization'] ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) throw new UnauthorizedException('Missing bearer token');
    try {
      await this.jwt.verifyAsync(token, { secret: process.env.KEYCLOAK_PUBLIC_KEY ?? 'dev' });
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
