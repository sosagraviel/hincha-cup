import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Relation
} from 'typeorm';
import { Project } from '@modules/project/database/models/project.model';
import { User } from '@modules/user/database/models/user.model';
import { Comment } from './comment.model';

/**
 * Represents a project board ticket with kanban status tracking.
 *
 * Table: `tickets`
 * Relationships: belongs to Project, has many Comments, optional Assignee (User), required Reporter (User)
 * Constraints: ticket_number is auto-incremented per project; status and priority are varchar enums
 *
 * @example
 * // Status: 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done'
 * // Priority: 'critical' | 'high' | 'medium' | 'low'
 * const tickets = await ticketRepo.find({ where: { projectId, status: 'todo' } });
 */
@Entity('tickets')
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId: string;

  @Column({ name: 'ticket_number', type: 'int' })
  ticketNumber: number;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'varchar', default: 'backlog' })
  status: string; // 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'done'

  @Column({ type: 'varchar', default: 'medium' })
  priority: string; // 'critical' | 'high' | 'medium' | 'low'

  @Column({ name: 'assignee_id', type: 'uuid', nullable: true })
  assigneeId?: string | null;

  @Column({ name: 'reporter_id', type: 'uuid' })
  reporterId: string;

  @Column({ name: 'order', type: 'int', default: 0 })
  order: number;

  @Column({ name: 'due_date', type: 'timestamp', nullable: true })
  dueDate?: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @ManyToOne(() => Project, project => project.tickets)
  @JoinColumn({ name: 'project_id' })
  project: Relation<Project>;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'assignee_id' })
  assignee?: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'reporter_id' })
  reporter: User;

  @OneToMany(() => Comment, comment => comment.ticket)
  comments: Relation<Comment[]>;
}
