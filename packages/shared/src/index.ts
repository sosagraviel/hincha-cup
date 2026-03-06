import "reflect-metadata";

// Base classes and types
export * from "./base";
export * from "./utils";
export * from "./enums";
export * from "./responses";

// Direct DTO exports (no namespace) - PREFERRED WAY TO IMPORT

// Comment DTOs
export { CreateCommentDto } from "./dtos/comment/create-comment.dto";
export { UpdateCommentDto } from "./dtos/comment/update-comment.dto";

// Invite DTOs
export { InviteUserDto } from "./dtos/invite/invite-user.dto";
export { InviteUserResponseDto } from "./dtos/invite/invite-user-response.dto";

// Organization DTOs
export { CreateOrganizationDto } from "./dtos/organization/create-organization.dto";
export { UpdateOrganizationDto } from "./dtos/organization/update-organization.dto";
export { AddOrgMemberDto } from "./dtos/organization/add-org-member.dto";
export { UpdateOrgMemberDto } from "./dtos/organization/update-org-member.dto";

// Pagination DTOs
export { PaginationQueryDto } from "./dtos/pagination/pagination-query.dto";

// Project DTOs
export { CreateProjectDto } from "./dtos/project/create-project.dto";
export { UpdateProjectDto } from "./dtos/project/update-project.dto";
export { AddProjectMemberDto } from "./dtos/project/add-project-member.dto";

// Ticket DTOs
export { CreateTicketDto } from "./dtos/ticket/create-ticket.dto";
export { UpdateTicketDto } from "./dtos/ticket/update-ticket.dto";
export { MoveTicketDto } from "./dtos/ticket/move-ticket.dto";
export { ListTicketsQueryDto } from "./dtos/ticket/list-tickets-query.dto";

// User DTOs
export { UpdateUserDto, UpdateUserStatusDto } from "./dtos/user/update-user.dto";
export { UserResponseDto } from "./dtos/user/user.response.dto";

// Chat DTOs
export { CreateRoomDto } from "./dtos/chat/create-room.dto";
export { SendMessageDto } from "./dtos/chat/send-message.dto";
export { StartDmDto } from "./dtos/chat/start-dm.dto";

// WebSocket DTOs
export * from "./dtos/websocket";

// Keep namespace for backwards compatibility (deprecated)
import * as DTOs from "./dtos";
/** @deprecated Use direct imports instead: import { CreateTicketDto } from '@livonit/shared' */
export { DTOs };
