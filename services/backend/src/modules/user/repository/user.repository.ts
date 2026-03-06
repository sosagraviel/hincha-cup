import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '@modules/user/database/models/user.model';

/**
 * Data access layer for the User entity.
 * Provides lookups by id, external id, and email, plus create/update operations.
 *
 * @example
 * constructor(private readonly userRepo: UserRepository) {}
 * const user = await this.userRepo.findByEmail('alice@acme.com');
 */
@Injectable()
export class UserRepository {
  constructor(
    @InjectRepository(User)
    private readonly repo: Repository<User>
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findByExternalId(externalId: string): Promise<User | null> {
    return this.repo.findOne({ where: { externalId } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email } });
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    await this.repo.update(id, data);
    const user = await this.repo.findOneOrFail({ where: { id } });
    return user;
  }

  async create(data: Partial<User>): Promise<User> {
    const user = this.repo.create(data);
    return this.repo.save(user);
  }
}
