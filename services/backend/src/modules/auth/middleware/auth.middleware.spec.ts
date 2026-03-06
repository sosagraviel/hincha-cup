import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { AuthMiddleware } from './auth.middleware';
import { RedisService } from '@modules/redis/redis.service';

// Mock the keycloak utility functions
jest.mock('@modules/auth/keycloak/keycloak.utils', () => ({
  validateToken: jest.fn(),
  decodeTokenUnsafe: jest.fn()
}));

import {
  validateToken,
  decodeTokenUnsafe
} from '@modules/auth/keycloak/keycloak.utils';

const mockRedisService = () => ({
  getJson: jest.fn(),
  setJson: jest.fn()
});

const makeDataSource = (user: object | null) => ({
  getRepository: jest.fn().mockReturnValue({
    findOne: jest.fn().mockResolvedValue(user)
  })
});

const makeReqRes = (authorization?: string) => {
  const req: {
    headers: { authorization?: string };
    auth?: object;
  } = { headers: {} };
  if (authorization) req.headers.authorization = authorization;
  const res = {};
  const next = jest.fn();
  return { req, res, next };
};

describe('AuthMiddleware', () => {
  let middleware: AuthMiddleware;
  let redisService: ReturnType<typeof mockRedisService>;
  let dataSource: ReturnType<typeof makeDataSource>;

  const buildModule = async (user: object | null = null) => {
    dataSource = makeDataSource(user);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthMiddleware,
        { provide: RedisService, useFactory: mockRedisService },
        { provide: DataSource, useValue: dataSource }
      ]
    }).compile();

    middleware = module.get<AuthMiddleware>(AuthMiddleware);
    redisService = module.get(RedisService);
  };

  beforeEach(() => buildModule());

  it('should call next immediately when no Authorization header is present', async () => {
    const { req, res, next } = makeReqRes();

    await middleware.use(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.auth).toBeUndefined();
  });

  it('should call next immediately when Authorization header does not start with Bearer', async () => {
    const { req, res, next } = makeReqRes('Basic dXNlcjpwYXNz');

    await middleware.use(req as never, res as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.auth).toBeUndefined();
  });

  it('should use cached session when Redis cache hit occurs', async () => {
    (decodeTokenUnsafe as jest.Mock).mockReturnValue({ sub: 'kc-user-1' });
    const cachedUser = { id: 'user-1', fullName: 'Alice' };
    const cachedToken = { sub: 'kc-user-1', realm_access: { roles: [] } };

    redisService.getJson = jest
      .fn()
      .mockResolvedValue({ user: cachedUser, token: cachedToken });

    const { req, res, next } = makeReqRes('Bearer valid.jwt.token');
    await middleware.use(req as never, res as never, next);

    expect(req.auth).toEqual({ user: cachedUser, token: cachedToken });
    expect(validateToken).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should validate token and populate auth when cache misses and user exists', async () => {
    await buildModule({ id: 'user-1', fullName: 'Alice' });

    (decodeTokenUnsafe as jest.Mock).mockReturnValue({ sub: 'kc-user-1' });
    const decodedToken = {
      sub: 'kc-user-1',
      exp: Math.floor(Date.now() / 1000) + 3600,
      realm_access: { roles: [] }
    };
    (validateToken as jest.Mock).mockResolvedValue(decodedToken);
    redisService.getJson = jest.fn().mockResolvedValue(null);
    redisService.setJson = jest.fn().mockResolvedValue(undefined);

    const { req, res, next } = makeReqRes('Bearer valid.jwt.token');
    await middleware.use(req as never, res as never, next);

    expect(validateToken).toHaveBeenCalledWith('valid.jwt.token');
    expect(redisService.setJson).toHaveBeenCalled();
    expect(req.auth).toMatchObject({
      user: { id: 'user-1' },
      token: decodedToken
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should call next silently when token decodes to a non-existent user', async () => {
    (decodeTokenUnsafe as jest.Mock).mockReturnValue({ sub: 'kc-unknown' });
    const decodedToken = {
      sub: 'kc-unknown',
      exp: Math.floor(Date.now() / 1000) + 3600
    };
    (validateToken as jest.Mock).mockResolvedValue(decodedToken);
    redisService.getJson = jest.fn().mockResolvedValue(null);

    const { req, res, next } = makeReqRes('Bearer valid.jwt.token');
    await middleware.use(req as never, res as never, next);

    expect(req.auth).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should call next silently when token validation throws an error', async () => {
    (decodeTokenUnsafe as jest.Mock).mockReturnValue({ sub: 'kc-user-1' });
    redisService.getJson = jest.fn().mockResolvedValue(null);
    (validateToken as jest.Mock).mockRejectedValue(
      new Error('Invalid signature')
    );

    const { req, res, next } = makeReqRes('Bearer invalid.token');
    await middleware.use(req as never, res as never, next);

    expect(req.auth).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('should call next when decodeTokenUnsafe returns null (no sub)', async () => {
    (decodeTokenUnsafe as jest.Mock).mockReturnValue(null);

    const { req, res, next } = makeReqRes('Bearer some.token');
    await middleware.use(req as never, res as never, next);

    expect(req.auth).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
