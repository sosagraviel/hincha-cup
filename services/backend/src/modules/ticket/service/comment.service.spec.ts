import { Test, TestingModule } from '@nestjs/testing';
import { CommentService } from './comment.service';
import { CommentRepository } from '@modules/ticket/repository/comment.repository';
import { TicketRepository } from '@modules/ticket/repository/ticket.repository';
import { EntityEventEmitter } from '@modules/queue/entity-event.emitter';
import { ForbiddenException, NotFoundException } from '@libs/exceptions';

const mockCommentRepository = () => ({
  findById: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn()
});

const mockTicketRepository = () => ({
  findById: jest.fn()
});

const mockEvents = () => ({
  emit: jest.fn()
});

describe('CommentService', () => {
  let service: CommentService;
  let commentRepo: ReturnType<typeof mockCommentRepository>;
  let ticketRepo: ReturnType<typeof mockTicketRepository>;
  let events: ReturnType<typeof mockEvents>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentService,
        { provide: CommentRepository, useFactory: mockCommentRepository },
        { provide: TicketRepository, useFactory: mockTicketRepository },
        { provide: EntityEventEmitter, useFactory: mockEvents }
      ]
    }).compile();

    service = module.get<CommentService>(CommentService);
    commentRepo = module.get(CommentRepository);
    ticketRepo = module.get(TicketRepository);
    events = module.get(EntityEventEmitter);
  });

  describe('addComment', () => {
    it('should create a comment and emit event', async () => {
      const ticket = { id: 'ticket-1' };
      const comment = {
        id: 'comment-1',
        ticketId: 'ticket-1',
        authorId: 'user-1',
        content: 'Hello'
      };
      ticketRepo.findById.mockResolvedValue(ticket);
      commentRepo.create.mockResolvedValue(comment);
      events.emit.mockResolvedValue(undefined);

      const result = await service.addComment('ticket-1', 'Hello', 'user-1');

      expect(commentRepo.create).toHaveBeenCalledWith({
        ticketId: 'ticket-1',
        authorId: 'user-1',
        content: 'Hello'
      });
      expect(events.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: 'comments',
          id: 'comment-1',
          parentId: 'ticket-1'
        })
      );
      expect(result).toBe(comment);
    });

    it('should throw NotFoundException when ticket does not exist', async () => {
      ticketRepo.findById.mockResolvedValue(null);

      await expect(
        service.addComment('missing', 'Hello', 'user-1')
      ).rejects.toThrow(NotFoundException);
      expect(commentRepo.create).not.toHaveBeenCalled();
    });
  });

  describe('updateComment', () => {
    it('should update comment when user is the author', async () => {
      const comment = {
        id: 'comment-1',
        ticketId: 'ticket-1',
        authorId: 'user-1'
      };
      const updated = { ...comment, content: 'Updated' };
      commentRepo.findById.mockResolvedValue(comment);
      commentRepo.update.mockResolvedValue(updated);
      events.emit.mockResolvedValue(undefined);

      const result = await service.updateComment(
        'comment-1',
        'Updated',
        'user-1'
      );

      expect(commentRepo.update).toHaveBeenCalledWith('comment-1', {
        content: 'Updated'
      });
      expect(events.emit).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'comments', parentId: 'ticket-1' })
      );
      expect(result).toBe(updated);
    });

    it('should throw NotFoundException when comment does not exist', async () => {
      commentRepo.findById.mockResolvedValue(null);

      await expect(
        service.updateComment('missing', 'x', 'user-1')
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not the author', async () => {
      commentRepo.findById.mockResolvedValue({
        id: 'comment-1',
        authorId: 'user-1'
      });

      await expect(
        service.updateComment('comment-1', 'x', 'user-2')
      ).rejects.toThrow(ForbiddenException);
      expect(commentRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteComment', () => {
    it('should delete comment when user is the author', async () => {
      const comment = {
        id: 'comment-1',
        ticketId: 'ticket-1',
        authorId: 'user-1'
      };
      commentRepo.findById.mockResolvedValue(comment);
      commentRepo.delete.mockResolvedValue(undefined);
      events.emit.mockResolvedValue(undefined);

      await service.deleteComment('comment-1', 'user-1');

      expect(commentRepo.delete).toHaveBeenCalledWith('comment-1');
      expect(events.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          entity: 'comments',
          id: 'comment-1',
          parentId: 'ticket-1'
        })
      );
    });

    it('should throw NotFoundException when comment does not exist', async () => {
      commentRepo.findById.mockResolvedValue(null);

      await expect(service.deleteComment('missing', 'user-1')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw ForbiddenException when user is not the author', async () => {
      commentRepo.findById.mockResolvedValue({
        id: 'comment-1',
        authorId: 'user-1'
      });

      await expect(
        service.deleteComment('comment-1', 'user-2')
      ).rejects.toThrow(ForbiddenException);
      expect(commentRepo.delete).not.toHaveBeenCalled();
    });
  });
});
