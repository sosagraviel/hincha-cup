import { Injectable } from '@nestjs/common';
import { CommentRepository } from '@modules/ticket/repository/comment.repository';
import { TicketRepository } from '@modules/ticket/repository/ticket.repository';
import { Comment } from '@modules/ticket/database/models/comment.model';
import { ForbiddenException, NotFoundException } from '@libs/exceptions';
import { EntityChangeType } from '@livonit/shared';
import { EntityEventEmitter } from '@modules/queue/entity-event.emitter';

/**
 * Manages comment lifecycle (create, update, delete) for tickets.
 * Enforces ownership rules and emits real-time events.
 *
 * @example
 * const comment = await this.commentService.addComment(ticketId, content, userId);
 */
@Injectable()
export class CommentService {
  constructor(
    private readonly commentRepository: CommentRepository,
    private readonly ticketRepository: TicketRepository,
    private readonly events: EntityEventEmitter
  ) {}

  /**
   * Add a comment to a ticket.
   * @throws NotFoundException if the ticket does not exist
   */
  async addComment(
    ticketId: string,
    content: string,
    authorId: string
  ): Promise<Comment> {
    const ticket = await this.ticketRepository.findById(ticketId);
    if (!ticket) {
      throw new NotFoundException('Ticket not found');
    }

    const comment = await this.commentRepository.create({
      ticketId,
      authorId,
      content
    });

    await this.events.emit({
      type: EntityChangeType.ENTITY_CREATED,
      entity: 'comments',
      id: comment.id,
      data: comment as unknown as Record<string, unknown>,
      parentId: ticketId,
      parentEntity: 'tickets'
    });

    return comment;
  }

  /**
   * Update a comment's content. Only the author may update.
   * @throws NotFoundException if the comment does not exist
   * @throws ForbiddenException if the user is not the author
   */
  async updateComment(
    commentId: string,
    content: string,
    userId: string
  ): Promise<Comment> {
    const comment = await this.commentRepository.findById(commentId);
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    if (comment.authorId !== userId) {
      throw new ForbiddenException('You can only edit your own comments');
    }

    const updated = await this.commentRepository.update(commentId, { content });

    await this.events.emit({
      type: EntityChangeType.ENTITY_UPDATED,
      entity: 'comments',
      id: updated.id,
      data: updated as unknown as Record<string, unknown>,
      parentId: comment.ticketId,
      parentEntity: 'tickets'
    });

    return updated;
  }

  /**
   * Delete a comment. Only the author may delete.
   * @throws NotFoundException if the comment does not exist
   * @throws ForbiddenException if the user is not the author
   */
  async deleteComment(commentId: string, userId: string): Promise<void> {
    const comment = await this.commentRepository.findById(commentId);
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    if (comment.authorId !== userId) {
      throw new ForbiddenException('You can only delete your own comments');
    }

    const ticketId = comment.ticketId;
    await this.commentRepository.delete(commentId);

    await this.events.emit({
      type: EntityChangeType.ENTITY_DELETED,
      entity: 'comments',
      id: commentId,
      parentId: ticketId,
      parentEntity: 'tickets'
    });
  }
}
