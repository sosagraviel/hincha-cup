import { INestApplicationContext, Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { Server, ServerOptions } from 'socket.io';
import {
  validateToken,
  decodeTokenUnsafe
} from '@modules/auth/keycloak/keycloak.utils';
import { RedisService } from '@modules/redis/redis.service';
import { User } from '@modules/user/database/models/user.model';
import { DataSource } from 'typeorm';

/**
 * Custom Socket.IO adapter that authenticates WebSocket connections using Keycloak JWTs.
 * Validates the Bearer token from the handshake auth header, checks the Redis session cache
 * first, then falls back to full token validation and DB user lookup.
 *
 * @example
 * // Applied in main.ts bootstrap:
 * app.useWebSocketAdapter(new AuthenticatedSocketIoAdapter(app));
 */
export class AuthenticatedSocketIoAdapter extends IoAdapter {
  private readonly logger = new Logger(AuthenticatedSocketIoAdapter.name);
  private redisService: RedisService;
  private dataSource: DataSource;

  constructor(private app: INestApplicationContext) {
    super(app);
    this.redisService = this.app.get(RedisService);
    this.dataSource = this.app.get(DataSource);
  }

  createIOServer(port: number, options?: Partial<ServerOptions>): Server {
    const server: Server = super.createIOServer(port, {
      ...options,
      cors: { origin: '*' }
    });

    server.use(async (socket, next) => {
      const authorization = socket.handshake.auth?.authorization as
        | string
        | undefined;
      const token = authorization?.startsWith('Bearer ')
        ? authorization.slice(7)
        : undefined;

      if (!token) {
        return next(new Error('Authentication required'));
      }

      try {
        // Try cached session first (same pattern as AuthMiddleware)
        const unsafePayload = decodeTokenUnsafe(token);
        if (!unsafePayload?.sub) {
          return next(new Error('Invalid token'));
        }

        const externalId = unsafePayload.sub;
        const cacheKey = `session:${externalId}`;

        const cached = await this.redisService.getJson<{
          user: User;
          token: Record<string, unknown>;
        }>(cacheKey);

        if (cached) {
          socket.data.user = cached.user;
          return next();
        }

        // Validate token and look up user
        await validateToken(token);
        const userRepository = this.dataSource.getRepository(User);
        const user = await userRepository.findOne({
          where: { externalId }
        });

        if (!user) {
          return next(new Error('User not found'));
        }

        socket.data.user = user;
        next();
      } catch (error) {
        this.logger.warn(`WebSocket authentication failed: ${error}`);
        next(new Error('Authentication failed'));
      }
    });

    return server;
  }
}
