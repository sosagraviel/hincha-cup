import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UserRepository } from '@modules/user/repository/user.repository';
import { OrganizationMember } from '@modules/organization/database/models/organization-member.model';
import { User } from '@modules/user/database/models/user.model';
import { NotFoundException } from '@libs/exceptions';

/**
 * Handles current-user profile retrieval and updates.
 * Returns user data enriched with organization memberships.
 *
 * @example
 * constructor(private readonly userService: UserService) {}
 * const profile = await this.userService.getCurrentUser(userId);
 */
@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly dataSource: DataSource
  ) {}

  /**
   * Returns the authenticated user's profile enriched with organization memberships.
   *
   * @param userId - UUID of the authenticated user
   * @returns User object with an `organizations` array (id, name, slug, logoUrl, role)
   * @throws {NotFoundException} When no user record exists for the given ID
   */
  async getCurrentUser(userId: string) {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const memberRepo = this.dataSource.getRepository(OrganizationMember);
    const memberships = await memberRepo.find({
      where: { userId: user.id },
      relations: ['organization']
    });

    return {
      ...user,
      organizations: memberships.map(m => ({
        id: m.organization.id,
        name: m.organization.name,
        slug: m.organization.slug,
        logoUrl: m.organization.logoUrl,
        role: m.role
      }))
    };
  }

  /**
   * Updates the authenticated user's mutable profile fields.
   *
   * @param userId - UUID of the authenticated user
   * @param data - Partial update: display name and/or profile picture URL (null clears it)
   * @returns The updated User entity
   * @throws {NotFoundException} When no user record exists for the given ID
   */
  async updateCurrentUser(
    userId: string,
    data: { fullName?: string; profilePictureUrl?: string | null }
  ): Promise<User> {
    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.userRepository.update(userId, data);
  }
}
