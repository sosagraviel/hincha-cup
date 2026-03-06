import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Relation
} from 'typeorm';
import { User } from '@modules/user/database/models/user.model';
import { Ticket } from './ticket.model';

/**
 * Represents a text comment on a ticket, authored by a user.
 *
 * Table: `comments`
 * Relationships: belongs to Ticket (CASCADE delete), belongs to User (author)
 * Constraints: content is required (text type)
 *
 * @example
 * const comments = await commentRepo.find({ where: { ticketId }, relations: ['author'] });
 */
@Entity('comments')
export class Comment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'ticket_id', type: 'uuid' })
  ticketId: string;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId: string;

  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Ticket, ticket => ticket.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticket_id' })
  ticket: Relation<Ticket>;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'author_id' })
  author: User;
}
