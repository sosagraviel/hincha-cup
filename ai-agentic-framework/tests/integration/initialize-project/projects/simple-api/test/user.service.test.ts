import { UserService } from '../src/services/user.service';

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
  });

  it('should create a user', async () => {
    const userData = {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User'
    };

    const user = await userService.create(userData);

    expect(user).toHaveProperty('id');
    expect(user.email).toBe(userData.email);
    expect(user.name).toBe(userData.name);
    expect(user).not.toHaveProperty('password');
  });

  it('should find all users', async () => {
    await userService.create({
      email: 'user1@example.com',
      password: 'password123',
      name: 'User 1'
    });

    await userService.create({
      email: 'user2@example.com',
      password: 'password123',
      name: 'User 2'
    });

    const users = await userService.findAll();

    expect(users).toHaveLength(2);
    expect(users[0]).not.toHaveProperty('password');
  });

  it('should find user by id', async () => {
    const created = await userService.create({
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User'
    });

    const found = await userService.findById(created.id);

    expect(found).not.toBeNull();
    expect(found?.email).toBe(created.email);
  });
});
