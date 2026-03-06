import { Test, TestingModule } from '@nestjs/testing';
import { ProjectService } from './project.service';
import { ProjectRepository } from '@modules/project/repository/project.repository';
import { EntityEventEmitter } from '@modules/queue/entity-event.emitter';
import { ConflictException, NotFoundException } from '@libs/exceptions';

const mockProjectRepository = () => ({
  findByOrgAndUser: jest.fn(),
  existsByKey: jest.fn(),
  create: jest.fn(),
  addMember: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  findMember: jest.fn(),
  removeMember: jest.fn()
});

const mockEvents = () => ({
  emit: jest.fn()
});

describe('ProjectService', () => {
  let service: ProjectService;
  let projectRepo: ReturnType<typeof mockProjectRepository>;
  let events: ReturnType<typeof mockEvents>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectService,
        { provide: ProjectRepository, useFactory: mockProjectRepository },
        { provide: EntityEventEmitter, useFactory: mockEvents }
      ]
    }).compile();

    service = module.get<ProjectService>(ProjectService);
    projectRepo = module.get(ProjectRepository);
    events = module.get(EntityEventEmitter);
  });

  describe('listOrgProjects', () => {
    it('should delegate to repository', async () => {
      const projects = [{ id: 'project-1' }];
      projectRepo.findByOrgAndUser.mockResolvedValue(projects);

      const result = await service.listOrgProjects('org-1', 'user-1');

      expect(projectRepo.findByOrgAndUser).toHaveBeenCalledWith(
        'org-1',
        'user-1'
      );
      expect(result).toBe(projects);
    });
  });

  describe('createProject', () => {
    it('should create project with uppercased key, add creator as admin, and emit event', async () => {
      projectRepo.existsByKey.mockResolvedValue(false);
      const project = { id: 'project-1', key: 'PLT', organizationId: 'org-1' };
      projectRepo.create.mockResolvedValue(project);
      projectRepo.addMember.mockResolvedValue({
        userId: 'user-1',
        role: 'admin'
      });
      projectRepo.findById.mockResolvedValue(project);
      events.emit.mockResolvedValue(undefined);

      const result = await service.createProject(
        'org-1',
        { name: 'Platform', key: 'plt' },
        'user-1'
      );

      expect(projectRepo.existsByKey).toHaveBeenCalledWith('org-1', 'PLT');
      expect(projectRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: 'org-1', key: 'PLT' })
      );
      expect(projectRepo.addMember).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          projectId: 'project-1',
          role: 'admin'
        })
      );
      expect(events.emit).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'projects', parentId: 'org-1' })
      );
      expect(result).toBe(project);
    });

    it('should throw ConflictException when project key already exists', async () => {
      projectRepo.existsByKey.mockResolvedValue(true);

      await expect(
        service.createProject(
          'org-1',
          { name: 'Platform', key: 'PLT' },
          'user-1'
        )
      ).rejects.toThrow(ConflictException);
      expect(projectRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('getProject', () => {
    it('should return project when found', async () => {
      const project = { id: 'project-1' };
      projectRepo.findById.mockResolvedValue(project);

      const result = await service.getProject('project-1');

      expect(result).toBe(project);
    });

    it('should throw NotFoundException when project does not exist', async () => {
      projectRepo.findById.mockResolvedValue(null);

      await expect(service.getProject('missing')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('updateProject', () => {
    it('should update project and emit event', async () => {
      const project = { id: 'project-1', organizationId: 'org-1' };
      const updated = { ...project, name: 'Platform v2' };
      projectRepo.findById.mockResolvedValue(project);
      projectRepo.update.mockResolvedValue(updated);
      events.emit.mockResolvedValue(undefined);

      const result = await service.updateProject('project-1', {
        name: 'Platform v2'
      });

      expect(projectRepo.update).toHaveBeenCalledWith('project-1', {
        name: 'Platform v2'
      });
      expect(events.emit).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'projects', parentId: 'org-1' })
      );
      expect(result).toBe(updated);
    });

    it('should throw NotFoundException for missing project', async () => {
      projectRepo.findById.mockResolvedValue(null);

      await expect(
        service.updateProject('missing', { name: 'x' })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('addMember', () => {
    it('should add member and emit event', async () => {
      projectRepo.findMember.mockResolvedValue(null);
      const member = {
        userId: 'user-2',
        projectId: 'project-1',
        role: 'member'
      };
      projectRepo.addMember.mockResolvedValue(member);
      projectRepo.findById.mockResolvedValue({
        id: 'project-1',
        organizationId: 'org-1'
      });
      events.emit.mockResolvedValue(undefined);

      const result = await service.addMember('project-1', 'user-2');

      expect(projectRepo.addMember).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-2',
          projectId: 'project-1',
          role: 'member'
        })
      );
      expect(result).toBe(member);
    });

    it('should throw ConflictException when user is already a member', async () => {
      projectRepo.findMember.mockResolvedValue({ userId: 'user-2' });

      await expect(service.addMember('project-1', 'user-2')).rejects.toThrow(
        ConflictException
      );
      expect(projectRepo.addMember).not.toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    it('should remove member and emit event', async () => {
      projectRepo.findMember.mockResolvedValue({ userId: 'user-2' });
      projectRepo.removeMember.mockResolvedValue(undefined);
      projectRepo.findById.mockResolvedValue({
        id: 'project-1',
        organizationId: 'org-1'
      });
      events.emit.mockResolvedValue(undefined);

      await service.removeMember('project-1', 'user-2');

      expect(projectRepo.removeMember).toHaveBeenCalledWith(
        'user-2',
        'project-1'
      );
    });

    it('should throw NotFoundException when member does not exist', async () => {
      projectRepo.findMember.mockResolvedValue(null);

      await expect(service.removeMember('project-1', 'user-2')).rejects.toThrow(
        NotFoundException
      );
    });
  });
});
