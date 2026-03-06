import { Injectable } from '@nestjs/common';
import { ChatRepository } from '../repository/chat.repository';
import { ChatMessage } from '../database/models/chat-message.model';
import { ChatRoom } from '../database/models/chat-room.model';
import { DmThread } from '../database/models/dm-thread.model';
import { EntityChangeType } from '@livonit/shared';
import { EntityEventEmitter } from '@modules/queue/entity-event.emitter';
import { ForbiddenException, NotFoundException } from '@libs/exceptions';

/**
 * Manages chat rooms, messages, DM threads, and read receipts.
 * Emits entity change events for real-time chat delivery via the queue.
 *
 * @example
 * constructor(private readonly chatService: ChatService) {}
 * const message = await this.chatService.sendMessage(content, senderId, { roomId });
 */
@Injectable()
export class ChatService {
  constructor(
    private readonly chatRepository: ChatRepository,
    private readonly events: EntityEventEmitter
  ) {}

  // ============ Chat Rooms ============

  /**
   * Creates a new chat room scoped to an organization.
   *
   * @param name - Display name for the room
   * @param organizationId - UUID of the owning organization
   * @param createdBy - UUID of the user creating the room
   * @param description - Optional room description
   * @param isPublic - Whether all org members can see this room (default `true`)
   * @returns The created ChatRoom entity
   */
  async createRoom(
    name: string,
    organizationId: string,
    createdBy: string,
    description?: string,
    isPublic = true
  ): Promise<ChatRoom> {
    const room = await this.chatRepository.createRoom({
      name,
      description,
      organizationId,
      createdBy,
      isPublic
    });

    // Emit room creation event
    await this.events.emit({
      type: EntityChangeType.ENTITY_CREATED,
      entity: 'chat_rooms',
      id: room.id,
      data: room as unknown as Record<string, unknown>
    });

    return room;
  }

  /**
   * Lists all chat rooms belonging to an organization.
   *
   * @param organizationId - UUID of the organization
   * @returns Array of ChatRoom entities
   */
  async listOrganizationRooms(organizationId: string): Promise<ChatRoom[]> {
    return this.chatRepository.findRoomsByOrganization(organizationId);
  }

  /**
   * Returns a single chat room by its primary key.
   *
   * @param id - UUID of the chat room
   * @returns The ChatRoom entity
   * @throws {NotFoundException} When the room does not exist
   */
  async getRoomById(id: string): Promise<ChatRoom> {
    const room = await this.chatRepository.findRoomById(id);
    if (!room) {
      throw new NotFoundException('Chat room not found');
    }
    return room;
  }

  // ============ Chat Messages ============

  /**
   * Persists and broadcasts a new chat message to a room, group, or DM thread.
   *
   * @param content - Text content of the message
   * @param senderId - UUID of the sending user
   * @param context - Delivery target: exactly one of roomId, groupId, or dmThreadId
   * @param parentMessageId - UUID of the parent message for threaded replies (optional)
   * @param metadata - Arbitrary JSON attached to the message (optional)
   * @returns The created ChatMessage entity
   */
  async sendMessage(
    content: string,
    senderId: string,
    context: {
      roomId?: string;
      groupId?: string;
      dmThreadId?: string;
    },
    parentMessageId?: string,
    metadata?: Record<string, unknown>
  ): Promise<ChatMessage> {
    const message = await this.chatRepository.createMessage({
      content,
      senderId,
      ...context,
      parentMessageId,
      metadata
    });

    // Emit message to queue for real-time delivery (Phase 4)
    await this.events.emit({
      type: EntityChangeType.ENTITY_CREATED,
      entity: 'chat',
      id: message.id,
      data: message as unknown as Record<string, unknown>
    });

    return message;
  }

  /**
   * Returns messages in a chat room in newest-first order with cursor-based pagination.
   *
   * @param roomId - UUID of the chat room
   * @param limit - Maximum number of messages to return (default 50)
   * @param before - Cursor: only return messages older than this timestamp
   * @returns Array of ChatMessage entities
   */
  async getRoomMessages(
    roomId: string,
    limit = 50,
    before?: Date
  ): Promise<ChatMessage[]> {
    return this.chatRepository.findRoomMessages(roomId, limit, before);
  }

  /**
   * Returns messages for a group with cursor-based pagination.
   *
   * @param groupId - UUID of the group
   * @param limit - Maximum number of messages to return (default 50)
   * @param before - Cursor: only return messages older than this timestamp
   * @returns Array of ChatMessage entities
   */
  async getGroupMessages(
    groupId: string,
    limit = 50,
    before?: Date
  ): Promise<ChatMessage[]> {
    return this.chatRepository.findGroupMessages(groupId, limit, before);
  }

  /**
   * Returns messages in a DM thread with cursor-based pagination.
   *
   * @param dmThreadId - UUID of the DM thread
   * @param limit - Maximum number of messages to return (default 50)
   * @param before - Cursor: only return messages older than this timestamp
   * @returns Array of ChatMessage entities
   */
  async getDmMessages(
    dmThreadId: string,
    limit = 50,
    before?: Date
  ): Promise<ChatMessage[]> {
    return this.chatRepository.findDmMessages(dmThreadId, limit, before);
  }

  /**
   * Soft-deletes a message. Only the original sender may delete their own message.
   *
   * @param id - UUID of the message to delete
   * @param userId - UUID of the requesting user
   * @throws {NotFoundException} When the message does not exist
   * @throws {ForbiddenException} When the requesting user is not the sender
   */
  async deleteMessage(id: string, userId: string): Promise<void> {
    const message = await this.chatRepository.findMessageById(id);
    if (!message) {
      throw new NotFoundException('Message not found');
    }

    // Only the sender can delete their own message
    if (message.senderId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to delete this message'
      );
    }

    await this.chatRepository.softDeleteMessage(id);

    // Emit deletion event
    await this.events.emit({
      type: EntityChangeType.ENTITY_DELETED,
      entity: 'chat',
      id
    });
  }

  // ============ DM Threads ============

  /**
   * Returns the existing DM thread between two users, or creates one if none exists.
   *
   * @param user1Id - UUID of the first user
   * @param user2Id - UUID of the second user
   * @returns The existing or newly created DmThread entity
   */
  async startOrGetDmThread(
    user1Id: string,
    user2Id: string
  ): Promise<DmThread> {
    return this.chatRepository.findOrCreateDmThread(user1Id, user2Id);
  }

  /**
   * Returns all DM threads that include the specified user.
   *
   * @param userId - UUID of the user
   * @returns Array of DmThread entities
   */
  async listUserDmThreads(userId: string): Promise<DmThread[]> {
    return this.chatRepository.findDmThreadsByUser(userId);
  }

  // ============ Read Receipts ============

  /**
   * Records that a user has read a message (upserts the read receipt).
   *
   * @param messageId - UUID of the message that was read
   * @param userId - UUID of the reading user
   */
  async markAsRead(messageId: string, userId: string): Promise<void> {
    await this.chatRepository.markAsRead(messageId, userId);

    // Emit read receipt event
    await this.events.emit({
      type: EntityChangeType.ENTITY_UPDATED,
      entity: 'chat',
      id: messageId
    });
  }
}
