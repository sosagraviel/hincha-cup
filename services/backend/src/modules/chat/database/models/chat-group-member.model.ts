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
import { ChatGroup } from './chat-group.model';
import { User } from '@modules/user/database/models/user.model';

/** Role within a chat group: owner, admin, or member. */
export type ChatGroupRole = 'owner' | 'admin' | 'member';

/**
 * Join table linking a User to a ChatGroup with a role-based membership.
 *
 * Table: `chat_group_members`
 * Relationships: belongs to ChatGroup (CASCADE), belongs to User (CASCADE)
 * Constraints: unique (group_id, user_id); role defaults to 'member'
 *
 * @example
 * const members = await memberRepo.find({ where: { groupId }, relations: ['user'] });
 */
@Entity('chat_group_members')
@Unique(['groupId', 'userId'])
export class ChatGroupMember {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'group_id', type: 'uuid' })
  groupId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 50, default: 'member' })
  role!: ChatGroupRole;

  @CreateDateColumn({ name: 'joined_at' })
  joinedAt!: Date;

  // Relations
  @ManyToOne(() => ChatGroup, group => group.members, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'group_id' })
  group?: Relation<ChatGroup>;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;
}
