import { UsersService } from './users.service.js';

describe('UsersService', () => {
  // Unit-style stub: the real test would inject a Repository<User> mock.
  // Kept skeletal so the framework's testing-conventions analyzer sees a
  // representative spec shape (jest + describe/it + expect).
  it('returns null when no user matches the email', async () => {
    const repo = { findOne: jest.fn().mockResolvedValue(null) };
    const service = new UsersService(repo as never);
    expect(await service.findByEmail('nope@example.com')).toBeNull();
    expect(repo.findOne).toHaveBeenCalledWith({ where: { email: 'nope@example.com' } });
  });

  it('persists a created user', async () => {
    const created = { id: 'u1', email: 'a@b.co', displayName: 'A' };
    const repo = {
      create: jest.fn().mockReturnValue(created),
      save: jest.fn().mockResolvedValue(created),
    };
    const service = new UsersService(repo as never);
    const result = await service.create({ email: 'a@b.co', displayName: 'A' });
    expect(result).toEqual(created);
    expect(repo.create).toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalled();
  });
});
