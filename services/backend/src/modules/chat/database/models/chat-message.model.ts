import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Relation
} from 'typeorm';
import { User } from '@modules/user/database/models/user.model';
import { ChatRoom } from './chat-room.model';
import { ChatGroup } from './chat-group.model';
import { DmThread } from './dm-thread.model';
import { MessageReadReceipt } from './message-read-receipt.model';

/** Supported chat message content types. */
export type MessageType = 'text' | 'image' | 'file' | 'system';

/**
 * Represents a chat message that belongs to exactly one context: a room, group, or DM thread.
 * Supports threaded replies via parentMessageId and soft-deletes via deletedAt.
 *
 * Table: `chat_messages`
 * Relationships: belongs to User (sender), optional ChatRoom/ChatGroup/DmThread, optional parent ChatMessage, has many replies, has many MessageReadReceipts
 * Constraints: exactly one of room_id, group_id, or dm_thread_id must be set
 *
 * @example
 * const messages = await msgRepo.find({ where: { roomId }, order: { createdAt: 'ASC' } });
 */
@Entity('chat_messages')
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({
    name: 'message_type',
    type: 'varchar',
    length: 50,
    default: 'text'
  })
  messageType!: MessageType;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', nullable: true })
  updatedAt?: Date;

  @Column({ name: 'deleted_at', type: 'timestamp', nullable: true })
  deletedAt?: Date;

  @Column({ name: 'sender_id', type: 'uuid' })
  senderId!: string;

  // Context - exactly one must be set
  @Column({ name: 'room_id', type: 'uuid', nullable: true })
  roomId?: string;

  @Column({ name: 'group_id', type: 'uuid', nullable: true })
  groupId?: string;

  @Column({ name: 'dm_thread_id', type: 'uuid', nullable: true })
  dmThreadId?: string;

  @Column({ name: 'parent_message_id', type: 'uuid', nullable: true })
  parentMessageId?: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sender_id' })
  sender?: User;

  @ManyToOne(() => ChatRoom, room => room.messages, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'room_id' })
  room?: Relation<ChatRoom>;

  @ManyToOne(() => ChatGroup, group => group.messages, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'group_id' })
  group?: Relation<ChatGroup>;

  @ManyToOne(() => DmThread, thread => thread.messages, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'dm_thread_id' })
  dmThread?: Relation<DmThread>;

  @ManyToOne(() => ChatMessage, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_message_id' })
  parentMessage?: Relation<ChatMessage>;

  @OneToMany(() => ChatMessage, message => message.parentMessage)
  replies?: Relation<ChatMessage[]>;

  @OneToMany(() => MessageReadReceipt, receipt => receipt.message)
  readReceipts?: Relation<MessageReadReceipt[]>;
}
