import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Request, Response, NextFunction } from 'express';
import { RedisService } from '@modules/redis/redis.service';
import { User } from '@modules/user/database/models/user.model';
import {
  validateToken,
  decodeTokenUnsafe
} from '@modules/auth/keycloak/keycloak.utils';

/**
 * Extracts and validates the Bearer JWT token from the Authorization header, then
 * populates `request.auth` with the User entity and decoded token. Uses Redis to
 * cache the session (keyed by Keycloak `sub`) so subsequent requests skip DB and
 * JWKS lookups. Silently passes through if no token is present.
 *
 * @example
 * // Applied globally in AuthModule:
 * consumer.apply(AuthMiddleware).forRoutes('*');
 */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AuthMiddleware.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.slice(7);
    if (!token) {
      return next();
    }

    try {
      const unsafePayload = decodeTokenUnsafe(token);
      if (!unsafePayload?.sub) {
        return next();
      }

      const externalId = unsafePayload.sub;
      const cacheKey = `session:${externalId}`;

      const cached = await this.redisService.getJson<{
        user: User;
        token: Record<string, any>;
      }>(cacheKey);

      if (cached) {
        (req as any).auth = {
          user: cached.user,
          token: cached.token
        };
        return next();
      }

      const decodedToken = await validateToken(token);
      const userRepository = this.dataSource.getRepository(User);
      const user = await userRepository.findOne({
        where: { externalId }
      });

      if (!user) {
        return next();
      }

      const bufferSeconds = 120;
      const now = Math.floor(Date.now() / 1000);
      const ttl = decodedToken.exp
        ? Math.max(decodedToken.exp - now - bufferSeconds, 60)
        : 300;

      await this.redisService.setJson(
        cacheKey,
        { user, token: decodedToken },
        ttl
      );

      (req as any).auth = {
        user,
        token: decodedToken
      };

      return next();
    } catch (error) {
      this.logger.warn(`Auth middleware token validation failed: ${error}`);
      return next();
    }
  }
}
