import bcrypt from 'bcrypt';

interface User {
  id: string;
  email: string;
  password: string;
  name: string;
}

export class UserService {
  private users: User[] = [];

  async findAll(): Promise<Omit<User, 'password'>[]> {
    return this.users.map(({ password, ...user }) => user);
  }

  async findById(id: string): Promise<Omit<User, 'password'> | null> {
    const user = this.users.find(u => u.id === id);
    if (!user) return null;
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async create(userData: Omit<User, 'id'>): Promise<Omit<User, 'password'>> {
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const user: User = {
      id: Math.random().toString(36).substr(2, 9),
      ...userData,
      password: hashedPassword
    };
    this.users.push(user);
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}
