import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  UseGuards
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiQuery
} from '@nestjs/swagger';
import { ChatService } from '../service/chat.service';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { User } from '@modules/user/database/models/user.model';
import { CreateRoomDto, SendMessageDto, StartDmDto } from '@livonit/shared';

/**
 * REST endpoints for chat rooms, messages, DM threads, and read receipts.
 * All routes require JWT authentication.
 *
 * @example
 * // POST /api/v1/chat/messages       { content, roomId }
 * // GET  /api/v1/chat/rooms/:id/messages?limit=50&before=<ISO>
 */
@ApiTags('Chat')
@ApiBearerAuth()
@Controller('chat')
@UseGuards(JwtAuthGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // ============ Chat Rooms ============

  @Post('rooms')
  @ApiOperation({ summary: 'Create a new chat room' })
  @ApiCreatedResponse({ description: 'Room created' })
  @ApiBadRequestResponse({ description: 'Validation error' })
  async createRoom(@CurrentUser() user: User, @Body() data: CreateRoomDto) {
    return this.chatService.createRoom(
      data.name,
      data.organizationId,
      user.id,
      data.description,
      data.isPublic
    );
  }

  @Get('rooms')
  @ApiOperation({ summary: 'List all rooms for an organization' })
  @ApiQuery({
    name: 'organizationId',
    description: 'UUID of the organization',
    required: true
  })
  @ApiOkResponse({ description: 'Array of chat rooms' })
  async listRooms(@Query('organizationId') organizationId: string) {
    return this.chatService.listOrganizationRooms(organizationId);
  }

  @Get('rooms/:id')
  @ApiOperation({ summary: 'Get a chat room by ID' })
  @ApiOkResponse({ description: 'Room details' })
  @ApiNotFoundResponse({ description: 'Room not found' })
  async getRoom(@Param('id') id: string) {
    return this.chatService.getRoomById(id);
  }

  @Get('rooms/:id/messages')
  @ApiOperation({
    summary: 'Get messages for a room (newest-first, cursor-based)'
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of messages to return (default 50)'
  })
  @ApiQuery({
    name: 'before',
    required: false,
    description: 'ISO 8601 cursor — return messages before this timestamp'
  })
  @ApiOkResponse({ description: 'Array of messages' })
  @ApiForbiddenResponse({ description: 'Not a room member' })
  async getRoomMessages(
    @Param('id') roomId: string,
    @Query('limit') limit?: number,
    @Query('before') before?: string
  ) {
    const beforeDate = before ? new Date(before) : undefined;
    return this.chatService.getRoomMessages(roomId, limit || 50, beforeDate);
  }

  // ============ Chat Messages ============

  @Post('messages')
  @ApiOperation({ summary: 'Send a message to a room, group, or DM thread' })
  @ApiCreatedResponse({ description: 'Message sent' })
  @ApiBadRequestResponse({ description: 'Validation error' })
  async sendMessage(@CurrentUser() user: User, @Body() data: SendMessageDto) {
    return this.chatService.sendMessage(
      data.content,
      user.id,
      {
        roomId: data.roomId,
        groupId: data.groupId,
        dmThreadId: data.dmThreadId
      },
      data.parentMessageId,
      data.metadata
    );
  }

  @Delete('messages/:id')
  @ApiOperation({ summary: 'Delete a message (sender only)' })
  @ApiOkResponse({ description: 'Message deleted' })
  @ApiForbiddenResponse({ description: 'Not the message sender' })
  @ApiNotFoundResponse({ description: 'Message not found' })
  async deleteMessage(@Param('id') id: string, @CurrentUser() user: User) {
    await this.chatService.deleteMessage(id, user.id);
    return { message: 'Message deleted successfully' };
  }

  @Post('messages/:id/read')
  @ApiOperation({ summary: 'Mark a message as read by the current user' })
  @ApiOkResponse({ description: 'Marked as read' })
  async markAsRead(@Param('id') messageId: string, @CurrentUser() user: User) {
    await this.chatService.markAsRead(messageId, user.id);
    return { message: 'Message marked as read' };
  }

  // ============ DM Threads ============

  @Post('dms')
  @ApiOperation({
    summary: 'Start or retrieve an existing DM thread with another user'
  })
  @ApiCreatedResponse({ description: 'DM thread (created or existing)' })
  async startDm(@CurrentUser() user: User, @Body() data: StartDmDto) {
    return this.chatService.startOrGetDmThread(user.id, data.otherUserId);
  }

  @Get('dms')
  @ApiOperation({ summary: 'List all DM threads for the current user' })
  @ApiOkResponse({ description: 'Array of DM threads' })
  async listDmThreads(@CurrentUser() user: User) {
    return this.chatService.listUserDmThreads(user.id);
  }

  @Get('dms/:id/messages')
  @ApiOperation({
    summary: 'Get messages in a DM thread (newest-first, cursor-based)'
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Number of messages to return (default 50)'
  })
  @ApiQuery({
    name: 'before',
    required: false,
    description: 'ISO 8601 cursor — return messages before this timestamp'
  })
  @ApiOkResponse({ description: 'Array of messages' })
  async getDmMessages(
    @Param('id') dmThreadId: string,
    @Query('limit') limit?: number,
    @Query('before') before?: string
  ) {
    const beforeDate = before ? new Date(before) : undefined;
    return this.chatService.getDmMessages(dmThreadId, limit || 50, beforeDate);
  }
}
