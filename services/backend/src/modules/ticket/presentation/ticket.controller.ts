import {
  Controller,
  Get,
  Post,
  Patch,
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
  ApiBadRequestResponse
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { ProjectMemberGuard } from '@modules/auth/guards/project-member.guard';
import { CurrentUser } from '@modules/auth/decorators/current-user.decorator';
import { TicketService } from '@modules/ticket/service/ticket.service';
import { CommentService } from '@modules/ticket/service/comment.service';
import { User } from '@modules/user/database/models/user.model';
import {
  CreateTicketDto,
  UpdateTicketDto,
  MoveTicketDto,
  ListTicketsQueryDto,
  CreateCommentDto,
  UpdateCommentDto
} from '@livonit/shared';

/**
 * REST endpoints for tickets (board, CRUD, move) and comments.
 * Board and ticket-list routes are project-scoped; comment routes are ticket-scoped.
 *
 * @example
 * // GET  /api/v1/projects/:projectId/board
 * // POST /api/v1/tickets/:ticketId/comments  { content }
 */
@ApiTags('Tickets')
@ApiBearerAuth()
@Controller()
@UseGuards(JwtAuthGuard)
export class TicketController {
  constructor(
    private readonly ticketService: TicketService,
    private readonly commentService: CommentService
  ) {}

  @Get('projects/:projectId/board')
  @UseGuards(ProjectMemberGuard)
  @ApiOperation({ summary: 'Get the Kanban board (tickets grouped by status)' })
  @ApiOkResponse({ description: 'Record<TicketStatus, Ticket[]>' })
  @ApiForbiddenResponse({ description: 'Not a project member' })
  async getBoard(@Param('projectId') projectId: string) {
    return this.ticketService.getBoard(projectId);
  }

  @Get('projects/:projectId/tickets')
  @UseGuards(ProjectMemberGuard)
  @ApiOperation({
    summary: 'List tickets in a project with pagination and filters'
  })
  @ApiOkResponse({ description: 'Paginated ticket list' })
  @ApiForbiddenResponse({ description: 'Not a project member' })
  async listTickets(
    @Param('projectId') projectId: string,
    @Query() query: ListTicketsQueryDto
  ) {
    const { page, limit, sort, ...filters } = query;
    return this.ticketService.listTickets(
      projectId,
      { page, limit, sort },
      filters
    );
  }

  @Post('projects/:projectId/tickets')
  @UseGuards(ProjectMemberGuard)
  @ApiOperation({ summary: 'Create a ticket in a project' })
  @ApiCreatedResponse({ description: 'Ticket created' })
  @ApiForbiddenResponse({ description: 'Not a project member' })
  @ApiBadRequestResponse({ description: 'Validation error' })
  async createTicket(
    @Param('projectId') projectId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateTicketDto
  ) {
    return this.ticketService.createTicket(
      projectId,
      {
        ...dto,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined
      },
      user.id
    );
  }

  @Get('tickets/:id')
  @ApiOperation({ summary: 'Get a ticket by ID' })
  @ApiOkResponse({ description: 'Ticket details' })
  @ApiNotFoundResponse({ description: 'Ticket not found' })
  async getTicket(@Param('id') id: string) {
    return this.ticketService.getTicket(id);
  }

  @Patch('tickets/:id')
  @ApiOperation({ summary: 'Update ticket details' })
  @ApiOkResponse({ description: 'Updated ticket' })
  @ApiNotFoundResponse({ description: 'Ticket not found' })
  async updateTicket(@Param('id') id: string, @Body() dto: UpdateTicketDto) {
    return this.ticketService.updateTicket(id, {
      ...dto,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined
    });
  }

  @Patch('tickets/:id/status')
  @ApiOperation({ summary: 'Move a ticket to a different status column' })
  @ApiOkResponse({ description: 'Ticket moved' })
  @ApiNotFoundResponse({ description: 'Ticket not found' })
  @ApiBadRequestResponse({ description: 'Invalid status value' })
  async moveTicket(@Param('id') id: string, @Body() dto: MoveTicketDto) {
    return this.ticketService.moveTicket(id, dto.status, dto.order);
  }

  @Delete('tickets/:id')
  @ApiOperation({ summary: 'Delete a ticket (project admin only)' })
  @ApiOkResponse({ description: 'Ticket deleted' })
  @ApiForbiddenResponse({ description: 'Requires project admin role' })
  @ApiNotFoundResponse({ description: 'Ticket not found' })
  async deleteTicket(@Param('id') id: string, @CurrentUser() user: User) {
    await this.ticketService.deleteTicket(id, user.id);
    return { message: 'Ticket deleted successfully' };
  }

  // Comment endpoints

  @Post('tickets/:ticketId/comments')
  @ApiOperation({ summary: 'Add a comment to a ticket' })
  @ApiCreatedResponse({ description: 'Comment created' })
  @ApiNotFoundResponse({ description: 'Ticket not found' })
  @ApiBadRequestResponse({ description: 'Empty comment content' })
  async addComment(
    @Param('ticketId') ticketId: string,
    @CurrentUser() user: User,
    @Body() dto: CreateCommentDto
  ) {
    return this.commentService.addComment(ticketId, dto.content, user.id);
  }

  @Patch('comments/:id')
  @ApiOperation({ summary: 'Update a comment (author only)' })
  @ApiOkResponse({ description: 'Updated comment' })
  @ApiForbiddenResponse({ description: 'Not the comment author' })
  async updateComment(
    @Param('id') id: string,
    @CurrentUser() user: User,
    @Body() dto: UpdateCommentDto
  ) {
    return this.commentService.updateComment(id, dto.content, user.id);
  }

  @Delete('comments/:id')
  @ApiOperation({ summary: 'Delete a comment (author only)' })
  @ApiOkResponse({ description: 'Comment deleted' })
  @ApiForbiddenResponse({ description: 'Not the comment author' })
  async deleteComment(@Param('id') id: string, @CurrentUser() user: User) {
    await this.commentService.deleteComment(id, user.id);
    return { message: 'Comment deleted successfully' };
  }
}
