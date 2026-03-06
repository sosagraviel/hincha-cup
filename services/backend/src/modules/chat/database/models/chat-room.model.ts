import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Relation
} from 'typeorm';
import { Organization } from '@modules/organization/database/models/organization.model';
import { User } from '@modules/user/database/models/user.model';
import { ChatMessage } from './chat-message.model';

/**
 * Represents an organization-scoped chat room (channel) that can be public or private.
 *
 * Table: `chat_rooms`
 * Relationships: belongs to Organization (CASCADE), belongs to creator User (RESTRICT), has many ChatMessages
 * Constraints: metadata stored as JSONB; is_public defaults to true
 *
 * @example
 * const rooms = await roomRepo.find({ where: { organizationId, isPublic: true } });
 */
@Entity('chat_rooms')
export class ChatRoom {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'organization_id', type: 'uuid' })
  organizationId!: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'is_public', type: 'boolean', default: true })
  isPublic!: boolean;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  // Relations
  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization?: Organization;

  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  creator?: User;

  @OneToMany(() => ChatMessage, message => message.room)
  messages?: Relation<ChatMessage[]>;
}
