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
import { ChatMessage } from './chat-message.model';
import { User } from '@modules/user/database/models/user.model';

/**
 * Tracks when a user has read a specific chat message.
 *
 * Table: `message_read_receipts`
 * Relationships: belongs to ChatMessage (CASCADE), belongs to User (CASCADE)
 * Constraints: unique (message_id, user_id) - one receipt per user per message
 *
 * @example
 * const isRead = await receiptRepo.findOne({ where: { messageId, userId } });
 */
@Entity('message_read_receipts')
@Unique(['messageId', 'userId'])
export class MessageReadReceipt {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'message_id', type: 'uuid' })
  messageId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @CreateDateColumn({ name: 'read_at' })
  readAt!: Date;

  // Relations
  @ManyToOne(() => ChatMessage, message => message.readReceipts, {
    onDelete: 'CASCADE'
  })
  @JoinColumn({ name: 'message_id' })
  message?: Relation<ChatMessage>;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;
}
