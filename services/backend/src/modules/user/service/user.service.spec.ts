import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { UserService } from './user.service';
import { UserRepository } from '@modules/user/repository/user.repository';
import { NotFoundException } from '@libs/exceptions';

const mockUserRepository = () => ({
  findById: jest.fn(),
  update: jest.fn()
});

const makeDataSource = (memberships: object[]) => ({
  getRepository: jest.fn().mockReturnValue({
    find: jest.fn().mockResolvedValue(memberships)
  })
});

describe('UserService', () => {
  let service: UserService;
  let userRepo: ReturnType<typeof mockUserRepository>;
  let dataSource: ReturnType<typeof makeDataSource>;

  const buildModule = async (memberships: object[] = []) => {
    dataSource = makeDataSource(memberships);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: UserRepository, useFactory: mockUserRepository },
        { provide: DataSource, useValue: dataSource }
      ]
    }).compile();

    service = module.get<UserService>(UserService);
    userRepo = module.get(UserRepository);
  };

  beforeEach(() => buildModule());

  describe('getCurrentUser', () => {
    it('should return user with organisations', async () => {
      const user = { id: 'user-1', fullName: 'Alice', email: 'alice@test.com' };
      userRepo.findById.mockResolvedValue(user);
      const memberships = [
        {
          organization: {
            id: 'org-1',
            name: 'Acme',
            slug: 'acme',
            logoUrl: null
          },
          role: 'owner'
        }
      ];
      dataSource.getRepository.mockReturnValue({
        find: jest.fn().mockResolvedValue(memberships)
      });

      const result = await service.getCurrentUser('user-1');

      expect(result.id).toBe('user-1');
      expect(result.organizations).toHaveLength(1);
      expect(result.organizations[0]).toEqual({
        id: 'org-1',
        name: 'Acme',
        slug: 'acme',
        logoUrl: null,
        role: 'owner'
      });
    });

    it('should return user with empty organisations list when not a member', async () => {
      const user = { id: 'user-1', fullName: 'Alice', email: 'alice@test.com' };
      userRepo.findById.mockResolvedValue(user);
      dataSource.getRepository.mockReturnValue({
        find: jest.fn().mockResolvedValue([])
      });

      const result = await service.getCurrentUser('user-1');

      expect(result.organizations).toEqual([]);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      userRepo.findById.mockResolvedValue(null);

      await expect(service.getCurrentUser('missing')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('updateCurrentUser', () => {
    it('should update and return updated user', async () => {
      const user = { id: 'user-1' };
      const updated = { id: 'user-1', fullName: 'Alice B.' };
      userRepo.findById.mockResolvedValue(user);
      userRepo.update.mockResolvedValue(updated);

      const result = await service.updateCurrentUser('user-1', {
        fullName: 'Alice B.'
      });

      expect(userRepo.update).toHaveBeenCalledWith('user-1', {
        fullName: 'Alice B.'
      });
      expect(result).toBe(updated);
    });

    it('should allow clearing profilePictureUrl (null)', async () => {
      userRepo.findById.mockResolvedValue({ id: 'user-1' });
      userRepo.update.mockResolvedValue({
        id: 'user-1',
        profilePictureUrl: null
      });

      const result = await service.updateCurrentUser('user-1', {
        profilePictureUrl: null
      });

      expect(userRepo.update).toHaveBeenCalledWith('user-1', {
        profilePictureUrl: null
      });
      expect(result.profilePictureUrl).toBeNull();
    });

    it('should throw NotFoundException when user does not exist', async () => {
      userRepo.findById.mockResolvedValue(null);

      await expect(
        service.updateCurrentUser('missing', { fullName: 'x' })
      ).rejects.toThrow(NotFoundException);
      expect(userRepo.update).not.toHaveBeenCalled();
    });
  });
});
