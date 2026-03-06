import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
  Relation
} from 'typeorm';
import { User } from '@modules/user/database/models/user.model';
import { Project } from './project.model';

/**
 * Join table linking a User to a Project with a role-based membership.
 *
 * Table: `project_members`
 * Relationships: belongs to User, belongs to Project
 * Constraints: unique (user_id, project_id); role is 'admin' | 'member' | 'viewer'
 *
 * @example
 * const member = await pmRepo.findOne({ where: { userId, projectId } });
 */
@Entity('project_members')
@Unique(['userId', 'projectId'])
export class ProjectMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ type: 'varchar', default: 'member' })
  role: string; // 'admin' | 'member' | 'viewer'

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Project, project => project.members)
  @JoinColumn({ name: 'project_id' })
  project: Relation<Project>;
}
