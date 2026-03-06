import { Test, TestingModule } from '@nestjs/testing';
import { OrganizationService } from './organization.service';
import { OrganizationRepository } from '@modules/organization/repository/organization.repository';
import { EntityEventEmitter } from '@modules/queue/entity-event.emitter';
import { ConflictException, NotFoundException } from '@libs/exceptions';

const mockOrgRepository = () => ({
  findUserOrganizations: jest.fn(),
  findBySlug: jest.fn(),
  create: jest.fn(),
  addMember: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  findMember: jest.fn(),
  removeMember: jest.fn(),
  updateMemberRole: jest.fn()
});

const mockEvents = () => ({
  emit: jest.fn()
});

describe('OrganizationService', () => {
  let service: OrganizationService;
  let orgRepo: ReturnType<typeof mockOrgRepository>;
  let events: ReturnType<typeof mockEvents>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrganizationService,
        { provide: OrganizationRepository, useFactory: mockOrgRepository },
        { provide: EntityEventEmitter, useFactory: mockEvents }
      ]
    }).compile();

    service = module.get<OrganizationService>(OrganizationService);
    orgRepo = module.get(OrganizationRepository);
    events = module.get(EntityEventEmitter);
  });

  describe('listUserOrganizations', () => {
    it('should delegate to repository', async () => {
      const orgs = [{ id: 'org-1' }];
      orgRepo.findUserOrganizations.mockResolvedValue(orgs);

      const result = await service.listUserOrganizations('user-1');

      expect(orgRepo.findUserOrganizations).toHaveBeenCalledWith('user-1');
      expect(result).toBe(orgs);
    });
  });

  describe('createOrganization', () => {
    it('should create org, add creator as owner, and emit event', async () => {
      orgRepo.findBySlug.mockResolvedValue(null);
      const org = { id: 'org-1', name: 'Acme', slug: 'acme' };
      orgRepo.create.mockResolvedValue(org);
      orgRepo.addMember.mockResolvedValue({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'owner'
      });
      events.emit.mockResolvedValue(undefined);

      const result = await service.createOrganization(
        { name: 'Acme', slug: 'acme' },
        'user-1'
      );

      expect(orgRepo.create).toHaveBeenCalledWith({
        name: 'Acme',
        slug: 'acme'
      });
      expect(orgRepo.addMember).toHaveBeenCalledWith({
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'owner'
      });
      expect(events.emit).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'organizations', id: 'org-1' })
      );
      expect(result).toBe(org);
    });

    it('should throw ConflictException when slug is already taken', async () => {
      orgRepo.findBySlug.mockResolvedValue({ id: 'org-existing' });

      await expect(
        service.createOrganization({ name: 'Acme', slug: 'acme' }, 'user-1')
      ).rejects.toThrow(ConflictException);
      expect(orgRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('getOrganization', () => {
    it('should return org when found', async () => {
      const org = { id: 'org-1' };
      orgRepo.findById.mockResolvedValue(org);

      const result = await service.getOrganization('org-1');

      expect(result).toBe(org);
    });

    it('should throw NotFoundException when org does not exist', async () => {
      orgRepo.findById.mockResolvedValue(null);

      await expect(service.getOrganization('missing')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('updateOrganization', () => {
    it('should update org and emit event', async () => {
      const org = { id: 'org-1' };
      const updated = { id: 'org-1', name: 'Acme Corp' };
      orgRepo.findById.mockResolvedValue(org);
      orgRepo.update.mockResolvedValue(updated);
      events.emit.mockResolvedValue(undefined);

      const result = await service.updateOrganization('org-1', {
        name: 'Acme Corp'
      });

      expect(orgRepo.update).toHaveBeenCalledWith('org-1', {
        name: 'Acme Corp'
      });
      expect(events.emit).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'organizations', id: 'org-1' })
      );
      expect(result).toBe(updated);
    });

    it('should throw NotFoundException for missing org', async () => {
      orgRepo.findById.mockResolvedValue(null);

      await expect(
        service.updateOrganization('missing', { name: 'x' })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('addMember', () => {
    it('should add member and emit event', async () => {
      orgRepo.findMember.mockResolvedValue(null);
      const member = {
        userId: 'user-2',
        organizationId: 'org-1',
        role: 'member'
      };
      orgRepo.addMember.mockResolvedValue(member);
      events.emit.mockResolvedValue(undefined);

      const result = await service.addMember('org-1', 'user-2');

      expect(orgRepo.addMember).toHaveBeenCalledWith({
        userId: 'user-2',
        organizationId: 'org-1',
        role: 'member'
      });
      expect(result).toBe(member);
    });

    it('should throw ConflictException when user is already a member', async () => {
      orgRepo.findMember.mockResolvedValue({ userId: 'user-2' });

      await expect(service.addMember('org-1', 'user-2')).rejects.toThrow(
        ConflictException
      );
      expect(orgRepo.addMember).not.toHaveBeenCalled();
    });
  });

  describe('removeMember', () => {
    it('should remove a non-owner member', async () => {
      orgRepo.findMember.mockResolvedValue({
        userId: 'user-2',
        role: 'member'
      });
      orgRepo.removeMember.mockResolvedValue(undefined);
      events.emit.mockResolvedValue(undefined);

      await service.removeMember('org-1', 'user-2');

      expect(orgRepo.removeMember).toHaveBeenCalledWith('user-2', 'org-1');
    });

    it('should throw NotFoundException when member does not exist', async () => {
      orgRepo.findMember.mockResolvedValue(null);

      await expect(service.removeMember('org-1', 'user-2')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw ConflictException when trying to remove the owner', async () => {
      orgRepo.findMember.mockResolvedValue({ userId: 'user-1', role: 'owner' });

      await expect(service.removeMember('org-1', 'user-1')).rejects.toThrow(
        ConflictException
      );
      expect(orgRepo.removeMember).not.toHaveBeenCalled();
    });
  });

  describe('updateMemberRole', () => {
    it('should update member role and emit event', async () => {
      const member = { userId: 'user-2', role: 'member' };
      const updated = { userId: 'user-2', role: 'admin' };
      orgRepo.findMember.mockResolvedValue(member);
      orgRepo.updateMemberRole.mockResolvedValue(updated);
      events.emit.mockResolvedValue(undefined);

      const result = await service.updateMemberRole('org-1', 'user-2', 'admin');

      expect(orgRepo.updateMemberRole).toHaveBeenCalledWith(
        'user-2',
        'org-1',
        'admin'
      );
      expect(result).toBe(updated);
    });

    it('should throw NotFoundException when member does not exist', async () => {
      orgRepo.findMember.mockResolvedValue(null);

      await expect(
        service.updateMemberRole('org-1', 'missing', 'admin')
      ).rejects.toThrow(NotFoundException);
    });
  });
});
