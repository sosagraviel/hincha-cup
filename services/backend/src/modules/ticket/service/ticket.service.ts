import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TicketRepository } from '@modules/ticket/repository/ticket.repository';
import { Ticket } from '@modules/ticket/database/models/ticket.model';
import { ProjectMember } from '@modules/project/database/models/project-member.model';
import { PaginationQuery, PaginatedResult } from '@libs/pagination';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException
} from '@libs/exceptions';
import { EntityChangeType, TicketStatus } from '@livonit/shared';
import { EntityEventEmitter } from '@modules/queue/entity-event.emitter';

/**
 * Manages ticket lifecycle (create, update, move, delete).
 * Provides Kanban board grouping and emits real-time events per project.
 *
 * @example
 * constructor(private readonly ticketService: TicketService) {}
 * const board = await this.ticketService.getBoard(projectId);
 */
@Injectable()
export class TicketService {
  constructor(
    private readonly ticketRepository: TicketRepository,
    private readonly events: EntityEventEmitter,
    @InjectRepository(ProjectMember)
    private readonly projectMemberRepo: Repository<ProjectMember>
  ) {}

  async getBoard(projectId: string): Promise<Record<string, Ticket[]>> {
    const tickets = await this.ticketRepository.findBoardTickets(projectId);

    const board: Record<string, Ticket[]> = {};
    for (const status of Object.values(TicketStatus)) {
      board[status] = [];
    }
    for (const ticket of tickets) {
      board[ticket.status]?.push(ticket);
    }

    return board;
  }

  async listTickets(
    projectId: string,
    query: PaginationQuery,
    filters?: { status?: string; assigneeId?: string; priority?: string }
  ): Promise<PaginatedResult<Ticket>> {
    return this.ticketRepository.findByProject(projectId, query, filters);
  }

  /**
   * Create a new ticket in a project.
   */
  async createTicket(
    projectId: string,
    data: {
      title: string;
      description?: string;
      status?: string;
      priority?: string;
      assigneeId?: string;
      dueDate?: Date;
    },
    reporterId: string
  ): Promise<Ticket> {
    const ticketNumber =
      await this.ticketRepository.getNextTicketNumber(projectId);

    const ticket = await this.ticketRepository.create({
      projectId,
      ticketNumber,
      title: data.title,
      description: data.description,
      status: data.status || TicketStatus.BACKLOG,
      priority: data.priority || 'medium',
      assigneeId: data.assigneeId,
      reporterId,
      dueDate: data.dueDate,
      order: 0
    });

    await this.events.emit({
      type: EntityChangeType.ENTITY_CREATED,
      entity: 'tickets',
      id: ticket.id,
      data: ticket as unknown as Record<string, unknown>,
      parentId: projectId,
      parentEntity: 'projects'
    });

    return ticket;
  }

  /**
   * Get a single ticket by ID.
   * @throws NotFoundException if the ticket does not exist
   */
  async getTicket(id: string): Promise<Ticket> {
    const ticket = await this.ticketRepository.findById(id);
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
    return ticket;
  }

  /**
   * Update mutable ticket fields (title, description, priority, assignee, due date).
   * @throws NotFoundException if the ticket does not exist
   */
  async updateTicket(
    id: string,
    data: Partial<
      Pick<
        Ticket,
        'title' | 'description' | 'priority' | 'assigneeId' | 'dueDate'
      >
    >
  ): Promise<Ticket> {
    const ticket = await this.ticketRepository.findById(id);
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const updated = await this.ticketRepository.update(id, data);

    await this.events.emit({
      type: EntityChangeType.ENTITY_UPDATED,
      entity: 'tickets',
      id: updated.id,
      data: updated as unknown as Record<string, unknown>,
      parentId: ticket.projectId,
      parentEntity: 'projects'
    });

    return updated;
  }

  /**
   * Move a ticket to a new status column and reorder position.
   * @throws NotFoundException if the ticket does not exist
   * @throws ConflictException if the status value is invalid
   */
  async moveTicket(
    id: string,
    status: TicketStatus,
    order: number
  ): Promise<Ticket> {
    const ticket = await this.ticketRepository.findById(id);
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }
    if (!Object.values(TicketStatus).includes(status)) {
      throw new ConflictException(`Invalid status: ${status}`);
    }

    const updated = await this.ticketRepository.update(id, { status, order });

    await this.events.emit({
      type: EntityChangeType.ENTITY_UPDATED,
      entity: 'tickets',
      id: updated.id,
      data: updated as unknown as Record<string, unknown>,
      parentId: ticket.projectId,
      parentEntity: 'projects'
    });

    return updated;
  }

  /**
   * Delete a ticket. Only project admins may delete tickets.
   * @throws NotFoundException if the ticket does not exist
   * @throws ForbiddenException if the user is not a project admin
   */
  async deleteTicket(id: string, userId: string): Promise<void> {
    const ticket = await this.ticketRepository.findById(id);
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const membership = await this.projectMemberRepo.findOne({
      where: { userId, projectId: ticket.projectId }
    });
    if (!membership || membership.role !== 'admin') {
      throw new ForbiddenException('Only project admins can delete tickets');
    }

    await this.ticketRepository.delete(id);

    await this.events.emit({
      type: EntityChangeType.ENTITY_DELETED,
      entity: 'tickets',
      id: ticket.id,
      parentId: ticket.projectId,
      parentEntity: 'projects'
    });
  }
}
