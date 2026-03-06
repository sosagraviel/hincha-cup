import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { ForbiddenException } from '@libs/exceptions';

const makeContext = (auth?: object): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ auth })
    }),
    getHandler: jest.fn(),
    getClass: jest.fn()
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn()
    } as unknown as jest.Mocked<Reflector>;
    guard = new RolesGuard(reflector);
  });

  it('should return true when no roles are required on the handler', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const context = makeContext({
      user: { id: 'user-1' },
      token: { realm_access: { roles: [] } }
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should return true when required roles list is empty', () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    const context = makeContext({
      user: { id: 'user-1' },
      token: { realm_access: { roles: [] } }
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should return true when user has the required role', () => {
    reflector.getAllAndOverride.mockReturnValue(['super_admin']);
    const context = makeContext({
      user: { id: 'user-1' },
      token: { realm_access: { roles: ['super_admin', 'member'] } }
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException when user lacks the required role', () => {
    reflector.getAllAndOverride.mockReturnValue(['super_admin']);
    const context = makeContext({
      user: { id: 'user-1' },
      token: { realm_access: { roles: ['member'] } }
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when no token is on request', () => {
    reflector.getAllAndOverride.mockReturnValue(['super_admin']);
    const context = makeContext({ user: { id: 'user-1' } });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should throw ForbiddenException when realm_access has no roles', () => {
    reflector.getAllAndOverride.mockReturnValue(['super_admin']);
    const context = makeContext({
      user: { id: 'user-1' },
      token: { realm_access: {} }
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
