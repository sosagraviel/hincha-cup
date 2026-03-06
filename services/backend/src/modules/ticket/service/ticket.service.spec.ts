import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TicketService } from './ticket.service';
import { TicketRepository } from '@modules/ticket/repository/ticket.repository';
import { ProjectMember } from '@modules/project/database/models/project-member.model';
import { EntityEventEmitter } from '@modules/queue/entity-event.emitter';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException
} from '@libs/exceptions';
import { TicketStatus } from '@livonit/shared';

const mockTicketRepository = () => ({
  findBoardTickets: jest.fn(),
  findByProject: jest.fn(),
  getNextTicketNumber: jest.fn(),
  create: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  delete: jest.fn()
});

const mockProjectMemberRepo = () => ({
  findOne: jest.fn()
});

const mockEvents = () => ({
  emit: jest.fn()
});

describe('TicketService', () => {
  let service: TicketService;
  let ticketRepo: ReturnType<typeof mockTicketRepository>;
  let projectMemberRepo: ReturnType<typeof mockProjectMemberRepo>;
  let events: ReturnType<typeof mockEvents>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketService,
        { provide: TicketRepository, useFactory: mockTicketRepository },
        {
          provide: getRepositoryToken(ProjectMember),
          useFactory: mockProjectMemberRepo
        },
        { provide: EntityEventEmitter, useFactory: mockEvents }
      ]
    }).compile();

    service = module.get<TicketService>(TicketService);
    ticketRepo = module.get(TicketRepository);
    projectMemberRepo = module.get(getRepositoryToken(ProjectMember));
    events = module.get(EntityEventEmitter);
  });

  describe('getBoard', () => {
    it('should group tickets by status', async () => {
      const tickets = [
        { id: '1', status: TicketStatus.TODO },
        { id: '2', status: TicketStatus.IN_PROGRESS },
        { id: '3', status: TicketStatus.TODO }
      ];
      ticketRepo.findBoardTickets.mockResolvedValue(tickets);

      const board = await service.getBoard('project-1');

      expect(board[TicketStatus.TODO]).toHaveLength(2);
      expect(board[TicketStatus.IN_PROGRESS]).toHaveLength(1);
      expect(board[TicketStatus.BACKLOG]).toHaveLength(0);
    });

    it('should initialise all status columns even if empty', async () => {
      ticketRepo.findBoardTickets.mockResolvedValue([]);

      const board = await service.getBoard('project-1');

      for (const status of Object.values(TicketStatus)) {
        expect(board[status]).toBeDefined();
        expect(board[status]).toHaveLength(0);
      }
    });
  });

  describe('listTickets', () => {
    it('should delegate to repository with filters', async () => {
      const result = {
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 }
      };
      ticketRepo.findByProject.mockResolvedValue(result);
      const filters = { status: TicketStatus.TODO };

      const out = await service.listTickets(
        'project-1',
        { page: 1, limit: 20 },
        filters
      );

      expect(ticketRepo.findByProject).toHaveBeenCalledWith(
        'project-1',
        { page: 1, limit: 20 },
        filters
      );
      expect(out).toBe(result);
    });
  });

  describe('createTicket', () => {
    it('should create a ticket and emit an event', async () => {
      ticketRepo.getNextTicketNumber.mockResolvedValue(5);
      const ticket = {
        id: 'ticket-1',
        projectId: 'project-1',
        ticketNumber: 5
      };
      ticketRepo.create.mockResolvedValue(ticket);
      events.emit.mockResolvedValue(undefined);

      const result = await service.createTicket(
        'project-1',
        { title: 'Test ticket', priority: 'medium' },
        'user-1'
      );

      expect(ticketRepo.getNextTicketNumber).toHaveBeenCalledWith('project-1');
      expect(ticketRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'project-1',
          ticketNumber: 5,
          title: 'Test ticket'
        })
      );
      expect(events.emit).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'tickets', parentId: 'project-1' })
      );
      expect(result).toBe(ticket);
    });

    it('should default to BACKLOG status when not provided', async () => {
      ticketRepo.getNextTicketNumber.mockResolvedValue(1);
      ticketRepo.create.mockResolvedValue({
        id: 't-1',
        status: TicketStatus.BACKLOG
      });
      events.emit.mockResolvedValue(undefined);

      await service.createTicket('project-1', { title: 'No status' }, 'user-1');

      expect(ticketRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: TicketStatus.BACKLOG })
      );
    });
  });

  describe('getTicket', () => {
    it('should return ticket when found', async () => {
      const ticket = { id: 'ticket-1' };
      ticketRepo.findById.mockResolvedValue(ticket);

      const result = await service.getTicket('ticket-1');

      expect(result).toBe(ticket);
    });

    it('should throw NotFoundException when ticket does not exist', async () => {
      ticketRepo.findById.mockResolvedValue(null);

      await expect(service.getTicket('missing')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('updateTicket', () => {
    it('should update and emit an event', async () => {
      const ticket = { id: 'ticket-1', projectId: 'project-1' };
      const updated = { ...ticket, title: 'Updated' };
      ticketRepo.findById.mockResolvedValue(ticket);
      ticketRepo.update.mockResolvedValue(updated);
      events.emit.mockResolvedValue(undefined);

      const result = await service.updateTicket('ticket-1', {
        title: 'Updated'
      });

      expect(ticketRepo.update).toHaveBeenCalledWith('ticket-1', {
        title: 'Updated'
      });
      expect(events.emit).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'tickets', parentId: 'project-1' })
      );
      expect(result).toBe(updated);
    });

    it('should throw NotFoundException for missing ticket', async () => {
      ticketRepo.findById.mockResolvedValue(null);

      await expect(
        service.updateTicket('missing', { title: 'x' })
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('moveTicket', () => {
    it('should update status and order, then emit', async () => {
      const ticket = { id: 'ticket-1', projectId: 'project-1' };
      const updated = { ...ticket, status: TicketStatus.IN_PROGRESS, order: 2 };
      ticketRepo.findById.mockResolvedValue(ticket);
      ticketRepo.update.mockResolvedValue(updated);
      events.emit.mockResolvedValue(undefined);

      const result = await service.moveTicket(
        'ticket-1',
        TicketStatus.IN_PROGRESS,
        2
      );

      expect(ticketRepo.update).toHaveBeenCalledWith('ticket-1', {
        status: TicketStatus.IN_PROGRESS,
        order: 2
      });
      expect(result).toBe(updated);
    });

    it('should throw NotFoundException for missing ticket', async () => {
      ticketRepo.findById.mockResolvedValue(null);

      await expect(
        service.moveTicket('missing', TicketStatus.TODO, 0)
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException for invalid status', async () => {
      ticketRepo.findById.mockResolvedValue({ id: 'ticket-1' });

      await expect(
        service.moveTicket('ticket-1', 'invalid_status' as TicketStatus, 0)
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('deleteTicket', () => {
    it('should delete ticket when user is project admin', async () => {
      const ticket = { id: 'ticket-1', projectId: 'project-1' };
      ticketRepo.findById.mockResolvedValue(ticket);
      projectMemberRepo.findOne.mockResolvedValue({
        userId: 'user-1',
        projectId: 'project-1',
        role: 'admin'
      });
      ticketRepo.delete.mockResolvedValue(undefined);
      events.emit.mockResolvedValue(undefined);

      await service.deleteTicket('ticket-1', 'user-1');

      expect(ticketRepo.delete).toHaveBeenCalledWith('ticket-1');
      expect(events.emit).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'tickets', id: 'ticket-1' })
      );
    });

    it('should throw NotFoundException for missing ticket', async () => {
      ticketRepo.findById.mockResolvedValue(null);

      await expect(service.deleteTicket('missing', 'user-1')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw ForbiddenException when user is not admin', async () => {
      ticketRepo.findById.mockResolvedValue({
        id: 'ticket-1',
        projectId: 'project-1'
      });
      projectMemberRepo.findOne.mockResolvedValue({ role: 'member' });

      await expect(service.deleteTicket('ticket-1', 'user-1')).rejects.toThrow(
        ForbiddenException
      );
    });

    it('should throw ForbiddenException when user is not a project member', async () => {
      ticketRepo.findById.mockResolvedValue({
        id: 'ticket-1',
        projectId: 'project-1'
      });
      projectMemberRepo.findOne.mockResolvedValue(null);

      await expect(service.deleteTicket('ticket-1', 'user-1')).rejects.toThrow(
        ForbiddenException
      );
    });
  });
});
