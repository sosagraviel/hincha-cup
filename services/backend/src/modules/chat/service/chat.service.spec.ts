import { Test, TestingModule } from '@nestjs/testing';
import { ChatService } from './chat.service';
import { ChatRepository } from '@modules/chat/repository/chat.repository';
import { EntityEventEmitter } from '@modules/queue/entity-event.emitter';
import { ForbiddenException, NotFoundException } from '@libs/exceptions';

const mockChatRepository = () => ({
  createRoom: jest.fn(),
  findRoomsByOrganization: jest.fn(),
  findRoomById: jest.fn(),
  createMessage: jest.fn(),
  findRoomMessages: jest.fn(),
  findGroupMessages: jest.fn(),
  findDmMessages: jest.fn(),
  findMessageById: jest.fn(),
  softDeleteMessage: jest.fn(),
  findOrCreateDmThread: jest.fn(),
  findDmThreadsByUser: jest.fn(),
  markAsRead: jest.fn()
});

const mockEvents = () => ({
  emit: jest.fn()
});

describe('ChatService', () => {
  let service: ChatService;
  let chatRepo: ReturnType<typeof mockChatRepository>;
  let events: ReturnType<typeof mockEvents>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChatService,
        { provide: ChatRepository, useFactory: mockChatRepository },
        { provide: EntityEventEmitter, useFactory: mockEvents }
      ]
    }).compile();

    service = module.get<ChatService>(ChatService);
    chatRepo = module.get(ChatRepository);
    events = module.get(EntityEventEmitter);
  });

  describe('createRoom', () => {
    it('should create a room and emit a creation event', async () => {
      const room = { id: 'room-1', name: 'General', organizationId: 'org-1' };
      chatRepo.createRoom.mockResolvedValue(room);
      events.emit.mockResolvedValue(undefined);

      const result = await service.createRoom(
        'General',
        'org-1',
        'user-1',
        undefined,
        true
      );

      expect(chatRepo.createRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'General',
          organizationId: 'org-1',
          createdBy: 'user-1'
        })
      );
      expect(events.emit).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'chat_rooms', id: 'room-1' })
      );
      expect(result).toBe(room);
    });
  });

  describe('listOrganizationRooms', () => {
    it('should delegate to repository', async () => {
      const rooms = [{ id: 'room-1' }];
      chatRepo.findRoomsByOrganization.mockResolvedValue(rooms);

      const result = await service.listOrganizationRooms('org-1');

      expect(chatRepo.findRoomsByOrganization).toHaveBeenCalledWith('org-1');
      expect(result).toBe(rooms);
    });
  });

  describe('getRoomById', () => {
    it('should return the room when found', async () => {
      const room = { id: 'room-1' };
      chatRepo.findRoomById.mockResolvedValue(room);

      const result = await service.getRoomById('room-1');

      expect(result).toBe(room);
    });

    it('should throw NotFoundException when room does not exist', async () => {
      chatRepo.findRoomById.mockResolvedValue(null);

      await expect(service.getRoomById('missing')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('sendMessage', () => {
    it('should create message and emit event', async () => {
      const message = {
        id: 'msg-1',
        content: 'Hello',
        senderId: 'user-1',
        roomId: 'room-1'
      };
      chatRepo.createMessage.mockResolvedValue(message);
      events.emit.mockResolvedValue(undefined);

      const result = await service.sendMessage('Hello', 'user-1', {
        roomId: 'room-1'
      });

      expect(chatRepo.createMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          content: 'Hello',
          senderId: 'user-1',
          roomId: 'room-1'
        })
      );
      expect(events.emit).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'chat', id: 'msg-1' })
      );
      expect(result).toBe(message);
    });
  });

  describe('getRoomMessages', () => {
    it('should delegate to repository with defaults', async () => {
      const messages = [{ id: 'msg-1' }];
      chatRepo.findRoomMessages.mockResolvedValue(messages);

      const result = await service.getRoomMessages('room-1');

      expect(chatRepo.findRoomMessages).toHaveBeenCalledWith(
        'room-1',
        50,
        undefined
      );
      expect(result).toBe(messages);
    });
  });

  describe('deleteMessage', () => {
    it('should delete message when user is the sender', async () => {
      const message = { id: 'msg-1', senderId: 'user-1' };
      chatRepo.findMessageById.mockResolvedValue(message);
      chatRepo.softDeleteMessage.mockResolvedValue(undefined);
      events.emit.mockResolvedValue(undefined);

      await service.deleteMessage('msg-1', 'user-1');

      expect(chatRepo.softDeleteMessage).toHaveBeenCalledWith('msg-1');
      expect(events.emit).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'chat', id: 'msg-1' })
      );
    });

    it('should throw NotFoundException when message does not exist', async () => {
      chatRepo.findMessageById.mockResolvedValue(null);

      await expect(service.deleteMessage('missing', 'user-1')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw ForbiddenException when user is not the sender', async () => {
      chatRepo.findMessageById.mockResolvedValue({
        id: 'msg-1',
        senderId: 'user-1'
      });

      await expect(service.deleteMessage('msg-1', 'user-2')).rejects.toThrow(
        ForbiddenException
      );
      expect(chatRepo.softDeleteMessage).not.toHaveBeenCalled();
    });
  });

  describe('startOrGetDmThread', () => {
    it('should delegate to repository', async () => {
      const thread = { id: 'thread-1' };
      chatRepo.findOrCreateDmThread.mockResolvedValue(thread);

      const result = await service.startOrGetDmThread('user-1', 'user-2');

      expect(chatRepo.findOrCreateDmThread).toHaveBeenCalledWith(
        'user-1',
        'user-2'
      );
      expect(result).toBe(thread);
    });
  });

  describe('listUserDmThreads', () => {
    it('should delegate to repository', async () => {
      const threads = [{ id: 'thread-1' }];
      chatRepo.findDmThreadsByUser.mockResolvedValue(threads);

      const result = await service.listUserDmThreads('user-1');

      expect(chatRepo.findDmThreadsByUser).toHaveBeenCalledWith('user-1');
      expect(result).toBe(threads);
    });
  });

  describe('markAsRead', () => {
    it('should mark message as read and emit event', async () => {
      chatRepo.markAsRead.mockResolvedValue(undefined);
      events.emit.mockResolvedValue(undefined);

      await service.markAsRead('msg-1', 'user-1');

      expect(chatRepo.markAsRead).toHaveBeenCalledWith('msg-1', 'user-1');
      expect(events.emit).toHaveBeenCalledWith(
        expect.objectContaining({ entity: 'chat', id: 'msg-1' })
      );
    });
  });
});
