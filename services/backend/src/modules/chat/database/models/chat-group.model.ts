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
import { User } from '@modules/user/database/models/user.model';
import { ChatGroupMember } from './chat-group-member.model';
import { ChatMessage } from './chat-message.model';

/**
 * Represents a private chat group with named membership (not tied to an org-level room).
 *
 * Table: `chat_groups`
 * Relationships: belongs to creator User (RESTRICT), has many ChatGroupMembers, has many ChatMessages
 * Constraints: metadata stored as JSONB
 *
 * @example
 * const group = await groupRepo.findOne({ where: { id: groupId }, relations: ['members'] });
 */
@Entity('chat_groups')
export class ChatGroup {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  // Relations
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'created_by' })
  creator?: User;

  @OneToMany(() => ChatGroupMember, member => member.group)
  members?: Relation<ChatGroupMember[]>;

  @OneToMany(() => ChatMessage, message => message.group)
  messages?: Relation<ChatMessage[]>;
}
