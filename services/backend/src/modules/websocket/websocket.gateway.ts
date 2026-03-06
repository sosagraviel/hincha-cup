import { randomUUID } from 'crypto';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect
} from '@nestjs/websockets';
import { OnEvent } from '@nestjs/event-emitter';
import { Server, Socket } from 'socket.io';
import { EntityChangeMessage } from '@livonit/shared';
import { InternalEntityChangePayload } from './websocket.types';
import { DeliveryProcessor } from '@modules/queue/processors/delivery.processor';
import { PresenceManager } from './managers/presence.manager';
import { TypingManager } from './managers/typing.manager';

/**
 * Central WebSocket gateway handling real-time communication for the application.
 * Manages Socket.IO room subscriptions for orgs, projects, chat rooms/groups/DMs,
 * and broadcasts entity change events, presence updates, typing indicators, and read receipts.
 *
 * @example
 * // Client-side: join a project room to receive ticket updates
 * socket.emit('join_project', { projectId: '...' });
 * socket.on('entity_change', (msg) => { /* handle update *\/ });
 */
@WebSocketGateway({ cors: { origin: '*' } })
@Injectable()
export class EventsGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly deliveryProcessor: DeliveryProcessor,
    private readonly presenceManager: PresenceManager,
    private readonly typingManager: TypingManager
  ) {}

  onModuleInit(): void {
    // Register Socket.IO server with delivery processor
    if (this.server) {
      this.deliveryProcessor.setServer(this.server);
      this.logger.log('Registered WebSocket server with delivery processor');
    }
  }

  async handleConnection(client: Socket): Promise<void> {
    const user = client.data.user;
    if (!user) {
      client.disconnect();
      return;
    }

    // Join user-specific channels
    client.join(`user:${user.id}`);
    client.join(`user:${user.id}:tickets:assigned`); // For fine-grained ticket notifications

    // Phase 5: Mark user as online and broadcast presence
    await this.presenceManager.markUserOnline(user.id);

    // Broadcast presence update to relevant users (e.g., org members)
    // TODO: Determine which users should receive presence updates
    this.server.emit('user_presence', {
      userId: user.id,
      status: 'online',
      timestamp: Date.now()
    });

    this.logger.log(`Client connected: ${client.id} (user: ${user.id})`);
  }

  async handleDisconnect(client: Socket): Promise<void> {
    const user = client.data.user;

    if (user) {
      // Remove user from presence tracking
      await this.presenceManager.removeUser(user.id);

      // Broadcast presence update
      this.server.emit('user_presence', {
        userId: user.id,
        status: 'offline',
        timestamp: Date.now()
      });
    }

    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('join_org')
  handleJoinOrg(client: Socket, data: { orgId: string }): void {
    if (!data?.orgId) return;
    client.join(`org:${data.orgId}`);
    this.logger.debug(`Client ${client.id} joined org room: ${data.orgId}`);
  }

  @SubscribeMessage('leave_org')
  handleLeaveOrg(client: Socket, data: { orgId: string }): void {
    if (!data?.orgId) return;
    client.leave(`org:${data.orgId}`);
    this.logger.debug(`Client ${client.id} left org room: ${data.orgId}`);
  }

  @SubscribeMessage('join_project')
  handleJoinProject(client: Socket, data: { projectId: string }): void {
    if (!data?.projectId) return;
    client.join(`project:${data.projectId}`);
    client.join(`project:${data.projectId}:tickets`);
    this.logger.debug(
      `Client ${client.id} joined project rooms: ${data.projectId}`
    );
  }

  @SubscribeMessage('leave_project')
  handleLeaveProject(client: Socket, data: { projectId: string }): void {
    if (!data?.projectId) return;
    client.leave(`project:${data.projectId}`);
    client.leave(`project:${data.projectId}:tickets`);
    this.logger.debug(
      `Client ${client.id} left project rooms: ${data.projectId}`
    );
  }

  // ============ Chat Channel Subscriptions (Phase 4) ============

  @SubscribeMessage('join_chat_room')
  handleJoinChatRoom(client: Socket, data: { roomId: string }): void {
    if (!data?.roomId) return;
    client.join(`chat:room:${data.roomId}`);
    this.logger.debug(`Client ${client.id} joined chat room: ${data.roomId}`);
  }

  @SubscribeMessage('leave_chat_room')
  handleLeaveChatRoom(client: Socket, data: { roomId: string }): void {
    if (!data?.roomId) return;
    client.leave(`chat:room:${data.roomId}`);
    this.logger.debug(`Client ${client.id} left chat room: ${data.roomId}`);
  }

  @SubscribeMessage('join_chat_group')
  handleJoinChatGroup(client: Socket, data: { groupId: string }): void {
    if (!data?.groupId) return;
    client.join(`chat:group:${data.groupId}`);
    this.logger.debug(`Client ${client.id} joined chat group: ${data.groupId}`);
  }

  @SubscribeMessage('leave_chat_group')
  handleLeaveChatGroup(client: Socket, data: { groupId: string }): void {
    if (!data?.groupId) return;
    client.leave(`chat:group:${data.groupId}`);
    this.logger.debug(`Client ${client.id} left chat group: ${data.groupId}`);
  }

  @SubscribeMessage('join_chat_dm')
  handleJoinChatDm(client: Socket, data: { dmThreadId: string }): void {
    if (!data?.dmThreadId) return;
    client.join(`chat:dm:${data.dmThreadId}`);
    this.logger.debug(
      `Client ${client.id} joined DM thread: ${data.dmThreadId}`
    );
  }

  @SubscribeMessage('leave_chat_dm')
  handleLeaveChatDm(client: Socket, data: { dmThreadId: string }): void {
    if (!data?.dmThreadId) return;
    client.leave(`chat:dm:${data.dmThreadId}`);
    this.logger.debug(`Client ${client.id} left DM thread: ${data.dmThreadId}`);
  }

  // ============ Typing Indicators (Phase 5) ============

  @SubscribeMessage('typing_start')
  async handleTypingStart(
    client: Socket,
    data: { context: 'room' | 'group' | 'dm'; contextId: string }
  ): Promise<void> {
    const user = client.data.user;
    if (!user || !data?.context || !data?.contextId) return;

    await this.typingManager.setTyping(data.context, data.contextId, user.id);

    // Broadcast to others in the same context
    const channel = `chat:${data.context}:${data.contextId}`;
    client.to(channel).emit('user_typing', {
      userId: user.id,
      context: data.context,
      contextId: data.contextId,
      typing: true
    });
  }

  @SubscribeMessage('typing_stop')
  async handleTypingStop(
    client: Socket,
    data: { context: 'room' | 'group' | 'dm'; contextId: string }
  ): Promise<void> {
    const user = client.data.user;
    if (!user || !data?.context || !data?.contextId) return;

    await this.typingManager.stopTyping(data.context, data.contextId, user.id);

    // Broadcast to others in the same context
    const channel = `chat:${data.context}:${data.contextId}`;
    client.to(channel).emit('user_typing', {
      userId: user.id,
      context: data.context,
      contextId: data.contextId,
      typing: false
    });
  }

  // ============ Presence Status (Phase 5) ============

  @SubscribeMessage('get_presence')
  async handleGetPresence(
    client: Socket,
    data: { userIds: string[] }
  ): Promise<void> {
    if (!data?.userIds || data.userIds.length === 0) return;

    const presences = await this.presenceManager.getUsersPresence(data.userIds);

    client.emit('presence_status', presences);
  }

  // ============ Read Receipts (Phase 7) ============

  @SubscribeMessage('message_read')
  handleMessageRead(
    client: Socket,
    data: {
      messageId: string;
      context: 'room' | 'group' | 'dm';
      contextId: string;
    }
  ): void {
    const user = client.data.user;
    if (!user || !data?.messageId || !data?.context || !data?.contextId) return;

    // Broadcast read receipt to others in the conversation
    const channel = `chat:${data.context}:${data.contextId}`;
    client.to(channel).emit('read_receipt', {
      messageId: data.messageId,
      userId: user.id,
      readAt: new Date().toISOString()
    });

    this.logger.debug(
      `Read receipt for message ${data.messageId} by user ${user.id}`
    );
  }

  @OnEvent('entity.changed')
  handleEntityChanged(payload: InternalEntityChangePayload): void {
    const message: EntityChangeMessage = {
      messageId: randomUUID(),
      type: payload.type,
      entity: payload.entity,
      id: payload.id,
      data: payload.data,
      parentId: payload.parentId,
      parentEntity: payload.parentEntity,
      timestamp: new Date().toISOString()
    };

    this.server.to(`org:${payload.orgId}`).emit('entity_change', message);

    this.logger.debug(
      `Broadcast ${payload.type} for ${payload.entity}:${payload.id} to org:${payload.orgId}`
    );
  }
}
