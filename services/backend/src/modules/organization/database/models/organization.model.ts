import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Relation
} from 'typeorm';
import { OrganizationMember } from './organization-member.model';
import { Project } from '@modules/project/database/models/project.model';

/**
 * Represents a workspace organization that groups users and projects.
 *
 * Table: `organizations`
 * Relationships: has many OrganizationMembers, has many Projects
 * Constraints: unique slug
 *
 * @example
 * const org = await orgRepo.findOne({ where: { slug: 'acme' }, relations: ['members'] });
 */
@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ nullable: true })
  description?: string;

  @Column({ name: 'logo_url', nullable: true, type: 'varchar' })
  logoUrl?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => OrganizationMember, member => member.organization)
  members: Relation<OrganizationMember[]>;

  @OneToMany(() => Project, project => project.organization)
  projects: Relation<Project[]>;
}
