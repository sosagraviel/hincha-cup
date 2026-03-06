import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Unique,
  Relation
} from 'typeorm';
import { Organization } from '@modules/organization/database/models/organization.model';
import { ProjectMember } from './project-member.model';
import { Ticket } from '@modules/ticket/database/models/ticket.model';

/**
 * Represents a project board within an organization, identified by a short key for ticket IDs.
 *
 * Table: `projects`
 * Relationships: belongs to Organization, has many ProjectMembers, has many Tickets
 * Constraints: unique (organization_id, key); key max 10 chars (e.g. "PLT" for PLT-123)
 *
 * @example
 * const project = await projectRepo.findOne({ where: { key: 'PLT', organizationId } });
 */
@Entity('projects')
@Unique(['organizationId', 'key'])
export class Project {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column()
  name: string;

  @Column({ length: 10 })
  key: string; // e.g., "PRJ"

  @Column({ nullable: true })
  description?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Organization, org => org.projects)
  @JoinColumn({ name: 'organization_id' })
  organization: Relation<Organization>;

  @OneToMany(() => ProjectMember, member => member.project)
  members: Relation<ProjectMember[]>;

  @OneToMany(() => Ticket, ticket => ticket.project)
  tickets: Relation<Ticket[]>;
}
