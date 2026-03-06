import { Injectable } from '@nestjs/common';
import { OrganizationRepository } from '@modules/organization/repository/organization.repository';
import { Organization } from '@modules/organization/database/models/organization.model';
import { OrganizationMember } from '@modules/organization/database/models/organization-member.model';
import { ConflictException, NotFoundException } from '@libs/exceptions';
import { EntityChangeType } from '@livonit/shared';
import { EntityEventEmitter } from '@modules/queue/entity-event.emitter';

/**
 * Manages organization CRUD operations and member management.
 * Emits entity change events for real-time delivery via WebSocket.
 *
 * @example
 * constructor(private readonly orgService: OrganizationService) {}
 * const orgs = await this.orgService.listUserOrganizations(userId);
 */
@Injectable()
export class OrganizationService {
  constructor(
    private readonly organizationRepository: OrganizationRepository,
    private readonly events: EntityEventEmitter
  ) {}

  /**
   * Returns all organizations the user is a member of.
   *
   * @param userId - UUID of the requesting user
   * @returns Array of organizations (with member role embedded)
   */
  async listUserOrganizations(userId: string): Promise<Organization[]> {
    return this.organizationRepository.findUserOrganizations(userId);
  }

  /**
   * Creates a new organization and assigns the creator as owner.
   *
   * @param data - Organization fields (name, slug, optional description/logoUrl)
   * @param creatorUserId - UUID of the user creating the organization (becomes owner)
   * @returns The created Organization entity
   * @throws {ConflictException} When the slug is already taken
   */
  async createOrganization(
    data: {
      name: string;
      slug: string;
      description?: string;
      logoUrl?: string;
    },
    creatorUserId: string
  ): Promise<Organization> {
    const existing = await this.organizationRepository.findBySlug(data.slug);
    if (existing) {
      throw new ConflictException(
        `Organization with slug "${data.slug}" already exists`
      );
    }

    const org = await this.organizationRepository.create(data);

    await this.organizationRepository.addMember({
      userId: creatorUserId,
      organizationId: org.id,
      role: 'owner'
    });

    // Emit to queue for real-time delivery
    await this.events.emit({
      type: EntityChangeType.ENTITY_CREATED,
      entity: 'organizations',
      id: org.id,
      data: org as unknown as Record<string, unknown>
    });

    return org;
  }

  /**
   * Returns a single organization by its primary key.
   *
   * @param id - UUID of the organization
   * @returns The Organization entity
   * @throws {NotFoundException} When the organization does not exist
   */
  async getOrganization(id: string): Promise<Organization> {
    const org = await this.organizationRepository.findById(id);
    if (!org) {
      throw new NotFoundException('Organization not found');
    }
    return org;
  }

  /**
   * Applies a partial update to an organization's mutable fields.
   *
   * @param id - UUID of the organization
   * @param data - Partial update: name, description, or logoUrl
   * @returns The updated Organization entity
   * @throws {NotFoundException} When the organization does not exist
   */
  async updateOrganization(
    id: string,
    data: Partial<Pick<Organization, 'name' | 'description' | 'logoUrl'>>
  ): Promise<Organization> {
    const org = await this.organizationRepository.findById(id);
    if (!org) {
      throw new NotFoundException('Organization not found');
    }

    const updated = await this.organizationRepository.update(id, data);

    // Emit to queue for real-time delivery
    await this.events.emit({
      type: EntityChangeType.ENTITY_UPDATED,
      entity: 'organizations',
      id,
      data: updated as unknown as Record<string, unknown>
    });

    return updated;
  }

  /**
   * Adds a user to an organization with the given role.
   *
   * @param organizationId - UUID of the organization
   * @param userId - UUID of the user to add
   * @param role - Role to assign (defaults to `'member'`)
   * @returns The created OrganizationMember record
   * @throws {ConflictException} When the user is already a member
   */
  async addMember(
    organizationId: string,
    userId: string,
    role: string = 'member'
  ): Promise<OrganizationMember> {
    const existing = await this.organizationRepository.findMember(
      userId,
      organizationId
    );
    if (existing) {
      throw new ConflictException(
        'User is already a member of this organization'
      );
    }

    const member = await this.organizationRepository.addMember({
      userId,
      organizationId,
      role
    });

    // Emit org update to invalidate members query
    await this.events.emit({
      type: EntityChangeType.ENTITY_UPDATED,
      entity: 'organizations',
      id: organizationId
    });

    return member;
  }

  /**
   * Removes a member from an organization. The owner cannot be removed.
   *
   * @param organizationId - UUID of the organization
   * @param userId - UUID of the user to remove
   * @throws {NotFoundException} When the user is not a member
   * @throws {ConflictException} When attempting to remove the owner
   */
  async removeMember(organizationId: string, userId: string): Promise<void> {
    const member = await this.organizationRepository.findMember(
      userId,
      organizationId
    );
    if (!member) {
      throw new NotFoundException('Member not found');
    }
    if (member.role === 'owner') {
      throw new ConflictException(
        'Cannot remove the owner of the organization'
      );
    }

    await this.organizationRepository.removeMember(userId, organizationId);

    // Emit org update to invalidate members query
    await this.events.emit({
      type: EntityChangeType.ENTITY_UPDATED,
      entity: 'organizations',
      id: organizationId
    });
  }

  /**
   * Changes a member's role within an organization.
   *
   * @param organizationId - UUID of the organization
   * @param userId - UUID of the member whose role should be changed
   * @param role - New role to assign
   * @returns The updated OrganizationMember record
   * @throws {NotFoundException} When the user is not a member
   */
  async updateMemberRole(
    organizationId: string,
    userId: string,
    role: string
  ): Promise<OrganizationMember> {
    const member = await this.organizationRepository.findMember(
      userId,
      organizationId
    );
    if (!member) {
      throw new NotFoundException('Member not found');
    }

    const updated = await this.organizationRepository.updateMemberRole(
      userId,
      organizationId,
      role
    );

    // Emit org update to invalidate members query
    await this.events.emit({
      type: EntityChangeType.ENTITY_UPDATED,
      entity: 'organizations',
      id: organizationId
    });

    return updated;
  }
}
