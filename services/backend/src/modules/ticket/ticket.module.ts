import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from './database/models/ticket.model';
import { Comment } from './database/models/comment.model';
import { ProjectMember } from '@modules/project/database/models/project-member.model';
import { TicketRepository } from './repository/ticket.repository';
import { CommentRepository } from './repository/comment.repository';
import { TicketService } from './service/ticket.service';
import { CommentService } from './service/comment.service';
import { TicketController } from './presentation/ticket.controller';
import { QueueModule } from '@modules/queue/queue.module';

/**
 * Encapsulates ticket and comment management, including Kanban board queries.
 * Imports QueueModule for real-time events.
 *
 * @example
 * @Module({ imports: [TicketModule] })
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket, Comment, ProjectMember]),
    QueueModule
  ],
  controllers: [TicketController],
  providers: [
    TicketRepository,
    CommentRepository,
    TicketService,
    CommentService
  ],
  exports: [TicketRepository, CommentRepository, TicketService, CommentService]
})
export class TicketModule {}
