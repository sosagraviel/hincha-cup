import { ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UnauthorizedException } from '@libs/exceptions';

const makeContext = (auth?: object): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ auth })
    }),
    getHandler: jest.fn(),
    getClass: jest.fn()
  }) as unknown as ExecutionContext;

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;

  beforeEach(() => {
    guard = new JwtAuthGuard();
  });

  it('should return true when request has an authenticated user', () => {
    const context = makeContext({ user: { id: 'user-1' } });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw UnauthorizedException when no auth is set on request', () => {
    const context = makeContext(undefined);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException when auth has no user property', () => {
    const context = makeContext({ token: 'some-token' });

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
