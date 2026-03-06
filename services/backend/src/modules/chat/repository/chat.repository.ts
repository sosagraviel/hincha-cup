import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ChatMessage,
  MessageType
} from '../database/models/chat-message.model';
import { ChatRoom } from '../database/models/chat-room.model';
import { ChatGroup } from '../database/models/chat-group.model';
import { DmThread } from '../database/models/dm-thread.model';
import { MessageReadReceipt } from '../database/models/message-read-receipt.model';

/**
 * Data access layer for chat rooms, messages, groups, DM threads, and read receipts.
 * Supports cursor-based message pagination and canonical DM thread creation.
 *
 * @example
 * constructor(private readonly chatRepo: ChatRepository) {}
 * const messages = await this.chatRepo.findRoomMessages(roomId, 50);
 */
@Injectable()
export class ChatRepository {
  constructor(
    @InjectRepository(ChatMessage)
    private readonly messageRepo: Repository<ChatMessage>,
    @InjectRepository(ChatRoom)
    private readonly roomRepo: Repository<ChatRoom>,
    @InjectRepository(ChatGroup)
    private readonly groupRepo: Repository<ChatGroup>,
    @InjectRepository(DmThread)
    private readonly dmThreadRepo: Repository<DmThread>,
    @InjectRepository(MessageReadReceipt)
    private readonly readReceiptRepo: Repository<MessageReadReceipt>
  ) {}

  // ============ Chat Rooms ============

  async createRoom(data: {
    name: string;
    description?: string;
    organizationId: string;
    createdBy: string;
    isPublic?: boolean;
  }): Promise<ChatRoom> {
    const room = this.roomRepo.create(data);
    return this.roomRepo.save(room);
  }

  async findRoomById(id: string): Promise<ChatRoom | null> {
    return this.roomRepo.findOne({ where: { id } });
  }

  async findRoomsByOrganization(organizationId: string): Promise<ChatRoom[]> {
    return this.roomRepo.find({
      where: { organizationId },
      order: { createdAt: 'ASC' }
    });
  }

  // ============ Chat Messages ============

  async createMessage(data: {
    content: string;
    senderId: string;
    messageType?: MessageType;
    roomId?: string;
    groupId?: string;
    dmThreadId?: string;
    parentMessageId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<ChatMessage> {
    const message = this.messageRepo.create(data);
    return this.messageRepo.save(message);
  }

  async findMessageById(id: string): Promise<ChatMessage | null> {
    return this.messageRepo.findOne({ where: { id } });
  }

  async findRoomMessages(
    roomId: string,
    limit = 50,
    before?: Date
  ): Promise<ChatMessage[]> {
    const query = this.messageRepo
      .createQueryBuilder('message')
      .where('message.room_id = :roomId', { roomId })
      .andWhere('message.deleted_at IS NULL')
      .orderBy('message.created_at', 'DESC')
      .limit(limit);

    if (before) {
      query.andWhere('message.created_at < :before', { before });
    }

    const messages = await query.getMany();
    return messages.reverse(); // Return in chronological order
  }

  async findGroupMessages(
    groupId: string,
    limit = 50,
    before?: Date
  ): Promise<ChatMessage[]> {
    const query = this.messageRepo
      .createQueryBuilder('message')
      .where('message.group_id = :groupId', { groupId })
      .andWhere('message.deleted_at IS NULL')
      .orderBy('message.created_at', 'DESC')
      .limit(limit);

    if (before) {
      query.andWhere('message.created_at < :before', { before });
    }

    const messages = await query.getMany();
    return messages.reverse();
  }

  async findDmMessages(
    dmThreadId: string,
    limit = 50,
    before?: Date
  ): Promise<ChatMessage[]> {
    const query = this.messageRepo
      .createQueryBuilder('message')
      .where('message.dm_thread_id = :dmThreadId', { dmThreadId })
      .andWhere('message.deleted_at IS NULL')
      .orderBy('message.created_at', 'DESC')
      .limit(limit);

    if (before) {
      query.andWhere('message.created_at < :before', { before });
    }

    const messages = await query.getMany();
    return messages.reverse();
  }

  async softDeleteMessage(id: string): Promise<void> {
    await this.messageRepo.update(id, { deletedAt: new Date() });
  }

  // ============ DM Threads ============

  async findOrCreateDmThread(
    user1Id: string,
    user2Id: string
  ): Promise<DmThread> {
    // Ensure canonical ordering (user1 < user2)
    const [canonicalUser1, canonicalUser2] =
      user1Id < user2Id ? [user1Id, user2Id] : [user2Id, user1Id];

    let thread = await this.dmThreadRepo.findOne({
      where: {
        user1Id: canonicalUser1,
        user2Id: canonicalUser2
      }
    });

    if (!thread) {
      thread = this.dmThreadRepo.create({
        user1Id: canonicalUser1,
        user2Id: canonicalUser2
      });
      thread = await this.dmThreadRepo.save(thread);
    }

    return thread;
  }

  async findDmThreadsByUser(userId: string): Promise<DmThread[]> {
    return this.dmThreadRepo
      .createQueryBuilder('thread')
      .where('thread.user1_id = :userId', { userId })
      .orWhere('thread.user2_id = :userId', { userId })
      .orderBy('thread.created_at', 'DESC')
      .getMany();
  }

  // ============ Read Receipts ============

  async markAsRead(
    messageId: string,
    userId: string
  ): Promise<MessageReadReceipt> {
    const existing = await this.readReceiptRepo.findOne({
      where: { messageId, userId }
    });

    if (existing) {
      return existing;
    }

    const receipt = this.readReceiptRepo.create({
      messageId,
      userId
    });

    return this.readReceiptRepo.save(receipt);
  }

  async findReadReceipts(messageId: string): Promise<MessageReadReceipt[]> {
    return this.readReceiptRepo.find({
      where: { messageId },
      relations: ['user']
    });
  }
}
