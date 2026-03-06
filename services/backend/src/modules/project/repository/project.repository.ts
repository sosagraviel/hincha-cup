import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from '@modules/project/database/models/project.model';
import { ProjectMember } from '@modules/project/database/models/project-member.model';

/**
 * Data access layer for Project and ProjectMember entities.
 * Handles project CRUD, key uniqueness checks, and member management.
 *
 * @example
 * constructor(private readonly projectRepo: ProjectRepository) {}
 * const exists = await this.projectRepo.existsByKey(orgId, 'PLT');
 */
@Injectable()
export class ProjectRepository {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(ProjectMember)
    private readonly memberRepo: Repository<ProjectMember>
  ) {}

  async findById(id: string): Promise<Project | null> {
    return this.projectRepo.findOne({
      where: { id },
      relations: ['members', 'members.user', 'organization']
    });
  }

  async findByOrgAndUser(
    organizationId: string,
    userId: string
  ): Promise<Project[]> {
    const memberships = await this.memberRepo.find({
      where: { userId },
      relations: ['project']
    });

    return memberships
      .map(m => m.project)
      .filter(p => p.organizationId === organizationId);
  }

  async create(data: Partial<Project>): Promise<Project> {
    const project = this.projectRepo.create(data);
    return this.projectRepo.save(project);
  }

  async update(id: string, data: Partial<Project>): Promise<Project> {
    await this.projectRepo.update(id, data);
    return this.projectRepo.findOneOrFail({ where: { id } });
  }

  async addMember(data: Partial<ProjectMember>): Promise<ProjectMember> {
    const member = this.memberRepo.create(data);
    return this.memberRepo.save(member);
  }

  async findMember(
    userId: string,
    projectId: string
  ): Promise<ProjectMember | null> {
    return this.memberRepo.findOne({
      where: { userId, projectId },
      relations: ['user']
    });
  }

  async removeMember(userId: string, projectId: string): Promise<void> {
    await this.memberRepo.delete({ userId, projectId });
  }

  async existsByKey(organizationId: string, key: string): Promise<boolean> {
    const count = await this.projectRepo.count({
      where: { organizationId, key }
    });
    return count > 0;
  }
}
