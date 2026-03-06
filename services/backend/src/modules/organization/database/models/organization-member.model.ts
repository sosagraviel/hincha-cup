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
import { Organization } from './organization.model';

/**
 * Join table linking a User to an Organization with a role-based membership.
 *
 * Table: `organization_members`
 * Relationships: belongs to User, belongs to Organization
 * Constraints: unique (user_id, organization_id); role is 'owner' | 'admin' | 'member'
 *
 * @example
 * const membership = await memberRepo.findOne({ where: { userId, organizationId } });
 */
@Entity('organization_members')
@Unique(['userId', 'organizationId'])
export class OrganizationMember {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId: string;

  @Column({ type: 'varchar', default: 'member' })
  role: string; // 'owner' | 'admin' | 'member'

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => Organization, org => org.members)
  @JoinColumn({ name: 'organization_id' })
  organization: Relation<Organization>;
}
