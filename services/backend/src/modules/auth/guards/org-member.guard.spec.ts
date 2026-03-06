import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { OrgMemberGuard } from './org-member.guard';
import { OrganizationMember } from '@modules/organization/database/models/organization-member.model';
import { ForbiddenException, UnauthorizedException } from '@libs/exceptions';
import { ORG_ROLES_KEY } from '@modules/auth/decorators/org-roles.decorator';

const makeContext = (request: object): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => request
    }),
    getHandler: jest.fn(),
    getClass: jest.fn()
  }) as unknown as ExecutionContext;

describe('OrgMemberGuard', () => {
  let guard: OrgMemberGuard;
  let memberRepo: { findOne: jest.Mock };
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;

  beforeEach(async () => {
    memberRepo = { findOne: jest.fn() };
    reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<
      Pick<Reflector, 'getAllAndOverride'>
    >;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrgMemberGuard,
        { provide: Reflector, useValue: reflector },
        {
          provide: getRepositoryToken(OrganizationMember),
          useValue: memberRepo
        }
      ]
    }).compile();

    guard = module.get<OrgMemberGuard>(OrgMemberGuard);
  });

  it('should return true when user is a member (no role restriction)', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const membership = {
      userId: 'user-1',
      organizationId: 'org-1',
      role: 'member'
    };
    memberRepo.findOne.mockResolvedValue(membership);

    const context = makeContext({
      auth: { user: { id: 'user-1' } },
      params: { orgId: 'org-1' }
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    const req = context.switchToHttp().getRequest() as {
      orgMembership?: typeof membership;
    };
    expect(req.orgMembership).toBe(membership);
  });

  it('should return true when user has one of the required roles', async () => {
    reflector.getAllAndOverride.mockReturnValue(['owner', 'admin']);
    memberRepo.findOne.mockResolvedValue({ role: 'admin' });

    const context = makeContext({
      auth: { user: { id: 'user-1' } },
      params: { orgId: 'org-1' }
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('should throw UnauthorizedException when no authenticated user', async () => {
    const context = makeContext({
      auth: undefined,
      params: { orgId: 'org-1' }
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException
    );
  });

  it('should throw ForbiddenException when orgId param is missing', async () => {
    const context = makeContext({
      auth: { user: { id: 'user-1' } },
      params: {}
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException
    );
  });

  it('should throw ForbiddenException when user is not a member', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    memberRepo.findOne.mockResolvedValue(null);

    const context = makeContext({
      auth: { user: { id: 'user-1' } },
      params: { orgId: 'org-1' }
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException
    );
  });

  it('should throw ForbiddenException when user role is insufficient', async () => {
    reflector.getAllAndOverride.mockReturnValue(['owner']);
    memberRepo.findOne.mockResolvedValue({ role: 'member' });

    const context = makeContext({
      auth: { user: { id: 'user-1' } },
      params: { orgId: 'org-1' }
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException
    );
  });

  it('should resolve orgId from :id param when :orgId is absent', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    memberRepo.findOne.mockResolvedValue({ role: 'admin' });

    const context = makeContext({
      auth: { user: { id: 'user-1' } },
      params: { id: 'org-2' }
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(memberRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ organizationId: 'org-2' })
      })
    );
  });

  it('should check against ORG_ROLES_KEY metadata key', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    memberRepo.findOne.mockResolvedValue({ role: 'admin' });

    const context = makeContext({
      auth: { user: { id: 'user-1' } },
      params: { orgId: 'org-1' }
    });
    await guard.canActivate(context);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      ORG_ROLES_KEY,
      expect.any(Array)
    );
  });
});
