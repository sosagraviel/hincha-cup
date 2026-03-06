import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Unique,
  Relation
} from 'typeorm';
import { User } from '@modules/user/database/models/user.model';
import { ChatMessage } from './chat-message.model';

/**
 * Represents a direct message thread between exactly two users.
 *
 * Table: `dm_threads`
 * Relationships: belongs to User (user1, CASCADE), belongs to User (user2, CASCADE), has many ChatMessages
 * Constraints: unique (user1_id, user2_id) - ensures one DM thread per user pair
 *
 * @example
 * const thread = await dmRepo.findOne({ where: [{ user1Id: a, user2Id: b }, { user1Id: b, user2Id: a }] });
 */
@Entity('dm_threads')
@Unique(['user1Id', 'user2Id'])
export class DmThread {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user1_id', type: 'uuid' })
  user1Id!: string;

  @Column({ name: 'user2_id', type: 'uuid' })
  user2Id!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  // Relations
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user1_id' })
  user1?: User;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user2_id' })
  user2?: User;

  @OneToMany(() => ChatMessage, message => message.dmThread)
  messages?: Relation<ChatMessage[]>;
}
