import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Organization } from '@modules/organization/database/models/organization.model';
import { OrganizationMember } from '@modules/organization/database/models/organization-member.model';

/**
 * Data access layer for Organization and OrganizationMember entities.
 * Handles org CRUD, slug lookups, and member add/remove/role-update operations.
 *
 * @example
 * constructor(private readonly orgRepo: OrganizationRepository) {}
 * const orgs = await this.orgRepo.findUserOrganizations(userId);
 */
@Injectable()
export class OrganizationRepository {
  constructor(
    @InjectRepository(Organization)
    private readonly orgRepo: Repository<Organization>,
    @InjectRepository(OrganizationMember)
    private readonly memberRepo: Repository<OrganizationMember>
  ) {}

  async findById(id: string): Promise<Organization | null> {
    return this.orgRepo.findOne({
      where: { id },
      relations: ['members', 'members.user']
    });
  }

  async findBySlug(slug: string): Promise<Organization | null> {
    return this.orgRepo.findOne({ where: { slug } });
  }

  async create(data: Partial<Organization>): Promise<Organization> {
    const org = this.orgRepo.create(data);
    return this.orgRepo.save(org);
  }

  async update(id: string, data: Partial<Organization>): Promise<Organization> {
    await this.orgRepo.update(id, data);
    return this.orgRepo.findOneOrFail({ where: { id } });
  }

  async findUserOrganizations(userId: string): Promise<Organization[]> {
    const memberships = await this.memberRepo.find({
      where: { userId },
      relations: ['organization']
    });
    return memberships.map(m => m.organization);
  }

  async addMember(
    data: Partial<OrganizationMember>
  ): Promise<OrganizationMember> {
    const member = this.memberRepo.create(data);
    return this.memberRepo.save(member);
  }

  async findMember(
    userId: string,
    organizationId: string
  ): Promise<OrganizationMember | null> {
    return this.memberRepo.findOne({
      where: { userId, organizationId },
      relations: ['user']
    });
  }

  async removeMember(userId: string, organizationId: string): Promise<void> {
    await this.memberRepo.delete({ userId, organizationId });
  }

  async updateMemberRole(
    userId: string,
    organizationId: string,
    role: string
  ): Promise<OrganizationMember> {
    await this.memberRepo.update({ userId, organizationId }, { role });
    return this.memberRepo.findOneOrFail({
      where: { userId, organizationId },
      relations: ['user']
    });
  }
}
