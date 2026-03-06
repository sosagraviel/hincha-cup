import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ChatMessage } from './database/models/chat-message.model';
import { ChatRoom } from './database/models/chat-room.model';
import { ChatGroup } from './database/models/chat-group.model';
import { ChatGroupMember } from './database/models/chat-group-member.model';
import { DmThread } from './database/models/dm-thread.model';
import { MessageReadReceipt } from './database/models/message-read-receipt.model';
import { ChatRepository } from './repository/chat.repository';
import { ChatService } from './service/chat.service';
import { ChatController } from './presentation/chat.controller';
import { QueueModule } from '@modules/queue/queue.module';

/**
 * Encapsulates chat rooms, group chats, DM threads, messages, and read receipts.
 * Depends on QueueModule for real-time message delivery.
 *
 * @example
 * @Module({ imports: [ChatModule] })
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ChatMessage,
      ChatRoom,
      ChatGroup,
      ChatGroupMember,
      DmThread,
      MessageReadReceipt
    ]),
    QueueModule
  ],
  controllers: [ChatController],
  providers: [ChatRepository, ChatService],
  exports: [ChatRepository, ChatService]
})
export class ChatModule {}
