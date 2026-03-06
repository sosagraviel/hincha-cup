import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { ExecutionContext } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ProjectMemberGuard } from './project-member.guard';
import { ProjectMember } from '@modules/project/database/models/project-member.model';
import { ForbiddenException, UnauthorizedException } from '@libs/exceptions';
import { PROJECT_ROLES_KEY } from '@modules/auth/decorators/project-roles.decorator';

const makeContext = (request: object): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => request
    }),
    getHandler: jest.fn(),
    getClass: jest.fn()
  }) as unknown as ExecutionContext;

describe('ProjectMemberGuard', () => {
  let guard: ProjectMemberGuard;
  let memberRepo: { findOne: jest.Mock };
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;

  beforeEach(async () => {
    memberRepo = { findOne: jest.fn() };
    reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<
      Pick<Reflector, 'getAllAndOverride'>
    >;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectMemberGuard,
        { provide: Reflector, useValue: reflector },
        { provide: getRepositoryToken(ProjectMember), useValue: memberRepo }
      ]
    }).compile();

    guard = module.get<ProjectMemberGuard>(ProjectMemberGuard);
  });

  it('should return true when user is a project member (no role restriction)', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const membership = {
      userId: 'user-1',
      projectId: 'project-1',
      role: 'member'
    };
    memberRepo.findOne.mockResolvedValue(membership);

    const context = makeContext({
      auth: { user: { id: 'user-1' } },
      params: { projectId: 'project-1' }
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    const req = context.switchToHttp().getRequest() as {
      projectMembership?: typeof membership;
    };
    expect(req.projectMembership).toBe(membership);
  });

  it('should return true when user has a required project role', async () => {
    reflector.getAllAndOverride.mockReturnValue(['admin', 'member']);
    memberRepo.findOne.mockResolvedValue({ role: 'admin' });

    const context = makeContext({
      auth: { user: { id: 'user-1' } },
      params: { projectId: 'project-1' }
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('should throw UnauthorizedException when no authenticated user', async () => {
    const context = makeContext({
      auth: undefined,
      params: { projectId: 'project-1' }
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException
    );
  });

  it('should throw ForbiddenException when projectId param is missing', async () => {
    const context = makeContext({
      auth: { user: { id: 'user-1' } },
      params: {}
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException
    );
  });

  it('should throw ForbiddenException when user is not a project member', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    memberRepo.findOne.mockResolvedValue(null);

    const context = makeContext({
      auth: { user: { id: 'user-1' } },
      params: { projectId: 'project-1' }
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException
    );
  });

  it('should throw ForbiddenException when role is insufficient (viewer not in admin/member)', async () => {
    reflector.getAllAndOverride.mockReturnValue(['admin', 'member']);
    memberRepo.findOne.mockResolvedValue({ role: 'viewer' });

    const context = makeContext({
      auth: { user: { id: 'user-1' } },
      params: { projectId: 'project-1' }
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException
    );
  });

  it('should resolve projectId from :id param when :projectId is absent', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    memberRepo.findOne.mockResolvedValue({ role: 'member' });

    const context = makeContext({
      auth: { user: { id: 'user-1' } },
      params: { id: 'project-2' }
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(memberRepo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ projectId: 'project-2' })
      })
    );
  });

  it('should check against PROJECT_ROLES_KEY metadata key', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    memberRepo.findOne.mockResolvedValue({ role: 'member' });

    const context = makeContext({
      auth: { user: { id: 'user-1' } },
      params: { projectId: 'project-1' }
    });
    await guard.canActivate(context);

    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(
      PROJECT_ROLES_KEY,
      expect.any(Array)
    );
  });
});
