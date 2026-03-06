import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from '@modules/ticket/database/models/comment.model';

/**
 * Data access layer for Comment entities.
 *
 * @example
 * const comments = await this.commentRepo.findByTicket(ticketId);
 */
@Injectable()
export class CommentRepository {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepo: Repository<Comment>
  ) {}

  async findById(id: string): Promise<Comment | null> {
    return this.commentRepo.findOne({
      where: { id },
      relations: ['author']
    });
  }

  async findByTicket(ticketId: string): Promise<Comment[]> {
    return this.commentRepo.find({
      where: { ticketId },
      relations: ['author'],
      order: { createdAt: 'ASC' }
    });
  }

  async create(data: Partial<Comment>): Promise<Comment> {
    const comment = this.commentRepo.create(data);
    return this.commentRepo.save(comment);
  }

  async update(id: string, data: Partial<Comment>): Promise<Comment> {
    await this.commentRepo.update(id, data);
    return this.commentRepo.findOneOrFail({
      where: { id },
      relations: ['author']
    });
  }

  async delete(id: string): Promise<void> {
    await this.commentRepo.delete(id);
  }
}
