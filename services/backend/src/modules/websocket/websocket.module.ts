import { Module } from '@nestjs/common';
import { EventsGateway } from './websocket.gateway';
import { QueueModule } from '@modules/queue/queue.module';
import { RedisModule } from '@modules/redis/redis.module';
import { PresenceManager } from './managers/presence.manager';
import { TypingManager } from './managers/typing.manager';

/**
 * Provides the Socket.IO gateway, presence tracking, and typing indicators.
 * Bridges the BullMQ delivery processor with connected WebSocket clients.
 *
 * @example
 * @Module({ imports: [WebSocketModule] })
 */
@Module({
  imports: [QueueModule, RedisModule],
  providers: [EventsGateway, PresenceManager, TypingManager],
  exports: [EventsGateway, PresenceManager, TypingManager]
})
export class WebSocketModule {}
