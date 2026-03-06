import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { Ticket } from '@modules/ticket/database/models/ticket.model';
import { Comment } from '@modules/ticket/database/models/comment.model';
import { paginate, PaginationQuery, PaginatedResult } from '@libs/pagination';

/**
 * Data access layer for Ticket and Comment entities.
 * Supports paginated queries, board grouping, auto-incrementing ticket numbers, and comment CRUD.
 *
 * @example
 * constructor(private readonly ticketRepo: TicketRepository) {}
 * const tickets = await this.ticketRepo.findBoardTickets(projectId);
 */
@Injectable()
export class TicketRepository {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepo: Repository<Ticket>,
    @InjectRepository(Comment)
    private readonly commentRepo: Repository<Comment>
  ) {}

  async findById(id: string): Promise<Ticket | null> {
    return this.ticketRepo.findOne({
      where: { id },
      relations: [
        'assignee',
        'reporter',
        'comments',
        'comments.author',
        'project'
      ]
    });
  }

  async findByProject(
    projectId: string,
    query: PaginationQuery,
    filters?: { status?: string; assigneeId?: string; priority?: string }
  ): Promise<PaginatedResult<Ticket>> {
    const where: FindOptionsWhere<Ticket> = { projectId };
    if (filters?.status) where.status = filters.status;
    if (filters?.assigneeId) where.assigneeId = filters.assigneeId;
    if (filters?.priority) where.priority = filters.priority;

    return paginate(this.ticketRepo, query, {
      where,
      relations: ['assignee', 'reporter']
    });
  }

  async findBoardTickets(projectId: string): Promise<Ticket[]> {
    return this.ticketRepo.find({
      where: { projectId },
      relations: ['assignee', 'reporter'],
      order: { status: 'ASC', order: 'ASC' }
    });
  }

  async getNextTicketNumber(projectId: string): Promise<number> {
    const result = await this.ticketRepo
      .createQueryBuilder('ticket')
      .select('MAX(ticket.ticket_number)', 'max')
      .where('ticket.project_id = :projectId', { projectId })
      .getRawOne();

    return (result?.max || 0) + 1;
  }

  async create(data: Partial<Ticket>): Promise<Ticket> {
    const ticket = this.ticketRepo.create(data);
    return this.ticketRepo.save(ticket);
  }

  async update(id: string, data: Partial<Ticket>): Promise<Ticket> {
    await this.ticketRepo.update(id, data);
    return this.ticketRepo.findOneOrFail({
      where: { id },
      relations: ['assignee', 'reporter']
    });
  }

  async delete(id: string): Promise<void> {
    await this.ticketRepo.delete(id);
  }

  // Comment methods
  async findCommentById(id: string): Promise<Comment | null> {
    return this.commentRepo.findOne({
      where: { id },
      relations: ['author']
    });
  }

  async findCommentsByTicket(ticketId: string): Promise<Comment[]> {
    return this.commentRepo.find({
      where: { ticketId },
      relations: ['author'],
      order: { createdAt: 'ASC' }
    });
  }

  async createComment(data: Partial<Comment>): Promise<Comment> {
    const comment = this.commentRepo.create(data);
    return this.commentRepo.save(comment);
  }

  async updateComment(id: string, data: Partial<Comment>): Promise<Comment> {
    await this.commentRepo.update(id, data);
    return this.commentRepo.findOneOrFail({
      where: { id },
      relations: ['author']
    });
  }

  async deleteComment(id: string): Promise<void> {
    await this.commentRepo.delete(id);
  }
}
