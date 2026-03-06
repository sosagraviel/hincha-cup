import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn
} from 'typeorm';

/**
 * Represents an application user backed by Keycloak for authentication.
 *
 * Table: `users`
 * Relationships: referenced by OrganizationMember, ProjectMember, Ticket (assignee/reporter), Comment (author)
 * Constraints: unique email, unique external_id (Keycloak sub claim)
 *
 * @example
 * // Status values: 'active' | 'invited' | 'inactive'
 * const user = await userRepo.findOne({ where: { email: 'alice@acme.com' } });
 */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'external_id', unique: true })
  externalId: string;

  @Column({ unique: true })
  email: string;

  @Column({ name: 'full_name', nullable: true })
  fullName: string;

  @Column({ name: 'profile_picture_url', nullable: true, type: 'varchar' })
  profilePictureUrl?: string | null;

  @Column({ name: 'status', type: 'varchar', default: 'active' })
  status: string; // 'active' | 'invited' | 'inactive'

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
