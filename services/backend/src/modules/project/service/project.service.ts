import { Injectable } from '@nestjs/common';
import { ProjectRepository } from '@modules/project/repository/project.repository';
import { Project } from '@modules/project/database/models/project.model';
import { ProjectMember } from '@modules/project/database/models/project-member.model';
import { ConflictException, NotFoundException } from '@libs/exceptions';
import { EntityChangeType } from '@livonit/shared';
import { EntityEventEmitter } from '@modules/queue/entity-event.emitter';

/**
 * Manages project CRUD, member management, and key uniqueness enforcement.
 * Emits entity change events scoped to the parent organization.
 *
 * @example
 * constructor(private readonly projectService: ProjectService) {}
 * const projects = await this.projectService.listOrgProjects(orgId, userId);
 */
@Injectable()
export class ProjectService {
  constructor(
    private readonly projectRepository: ProjectRepository,
    private readonly events: EntityEventEmitter
  ) {}

  /**
   * Returns all projects in an organization that the user has access to.
   *
   * @param organizationId - UUID of the parent organization
   * @param userId - UUID of the requesting user
   * @returns Array of Project entities
   */
  async listOrgProjects(
    organizationId: string,
    userId: string
  ): Promise<Project[]> {
    return this.projectRepository.findByOrgAndUser(organizationId, userId);
  }

  /**
   * Creates a new project under an organization and assigns the creator as admin.
   * The key is automatically uppercased before persisting.
   *
   * @param organizationId - UUID of the parent organization
   * @param data - Project fields (name, key, optional description)
   * @param creatorUserId - UUID of the user creating the project (becomes admin)
   * @returns The created Project entity
   * @throws {ConflictException} When the key already exists in the organization
   */
  async createProject(
    organizationId: string,
    data: { name: string; key: string; description?: string },
    creatorUserId: string
  ): Promise<Project> {
    const keyExists = await this.projectRepository.existsByKey(
      organizationId,
      data.key.toUpperCase()
    );
    if (keyExists) {
      throw new ConflictException(
        `Project key "${data.key}" already exists in this organization`
      );
    }

    const project = await this.projectRepository.create({
      organizationId,
      name: data.name,
      key: data.key.toUpperCase(),
      description: data.description
    });

    await this.projectRepository.addMember({
      userId: creatorUserId,
      projectId: project.id,
      role: 'admin'
    });

    // Emit to queue for real-time delivery
    await this.events.emit({
      type: EntityChangeType.ENTITY_CREATED,
      entity: 'projects',
      id: project.id,
      data: project as unknown as Record<string, unknown>,
      parentId: organizationId,
      parentEntity: 'organizations'
    });

    return project;
  }

  /**
   * Returns a single project by its primary key.
   *
   * @param id - UUID of the project
   * @returns The Project entity
   * @throws {NotFoundException} When the project does not exist
   */
  async getProject(id: string): Promise<Project> {
    const project = await this.projectRepository.findById(id);
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  /**
   * Applies a partial update to a project's mutable fields.
   *
   * @param id - UUID of the project
   * @param data - Partial update: name or description
   * @returns The updated Project entity
   * @throws {NotFoundException} When the project does not exist
   */
  async updateProject(
    id: string,
    data: Partial<Pick<Project, 'name' | 'description'>>
  ): Promise<Project> {
    const project = await this.projectRepository.findById(id);
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const updated = await this.projectRepository.update(id, data);

    // Emit to queue for real-time delivery
    await this.events.emit({
      type: EntityChangeType.ENTITY_UPDATED,
      entity: 'projects',
      id: updated.id,
      data: updated as unknown as Record<string, unknown>,
      parentId: project.organizationId,
      parentEntity: 'organizations'
    });

    return updated;
  }

  /**
   * Adds a user to a project with the given role.
   *
   * @param projectId - UUID of the project
   * @param userId - UUID of the user to add
   * @param role - Role to assign (defaults to `'member'`)
   * @returns The created ProjectMember record
   * @throws {ConflictException} When the user is already a member
   */
  async addMember(
    projectId: string,
    userId: string,
    role: string = 'member'
  ): Promise<ProjectMember> {
    const existing = await this.projectRepository.findMember(userId, projectId);
    if (existing) {
      throw new ConflictException('User is already a member of this project');
    }

    const member = await this.projectRepository.addMember({
      userId,
      projectId,
      role
    });

    // Load project to get orgId
    const project = await this.projectRepository.findById(projectId);
    if (project) {
      // Emit project update to invalidate members query
      await this.events.emit({
        type: EntityChangeType.ENTITY_UPDATED,
        entity: 'projects',
        id: projectId,
        parentId: project.organizationId,
        parentEntity: 'organizations'
      });
    }

    return member;
  }

  /**
   * Removes a member from a project.
   *
   * @param projectId - UUID of the project
   * @param userId - UUID of the user to remove
   * @throws {NotFoundException} When the user is not a member of the project
   */
  async removeMember(projectId: string, userId: string): Promise<void> {
    const member = await this.projectRepository.findMember(userId, projectId);
    if (!member) {
      throw new NotFoundException('Member not found');
    }

    await this.projectRepository.removeMember(userId, projectId);

    // Load project to get orgId
    const project = await this.projectRepository.findById(projectId);
    if (project) {
      // Emit project update to invalidate members query
      await this.events.emit({
        type: EntityChangeType.ENTITY_UPDATED,
        entity: 'projects',
        id: projectId,
        parentId: project.organizationId,
        parentEntity: 'organizations'
      });
    }
  }
}
