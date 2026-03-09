/**
 * API types - Re-exported from @livonit/shared for type consistency across services.
 * Frontend uses these as TypeScript types (not runtime validation).
 */

// Enums - Direct re-exports
export {
  TicketStatus,
  Priority,
  OrgRole,
  ProjectRole,
  UserStatus
} from '@livonit/shared';

// Response types (interfaces) - Direct re-exports
export type {
  User,
  Organization,
  OrganizationMember,
  Project,
  ProjectMember,
  Ticket,
  Comment,
  BoardColumn,
  PaginatedResponse,
  ChatRoom,
  ChatMessage,
  DmThread
} from '@livonit/shared';

// Request DTOs (classes with validation in backend, but frontend uses as types)
export type {
  CreateTicketDto as CreateTicketRequest,
  UpdateTicketDto as UpdateTicketRequest,
  MoveTicketDto as MoveTicketRequest,
  CreateProjectDto as CreateProjectRequest,
  UpdateProjectDto as UpdateProjectRequest,
  CreateOrganizationDto as CreateOrganizationRequest,
  UpdateOrganizationDto as UpdateOrganizationRequest,
  CreateRoomDto as CreateRoomRequest,
  SendMessageDto as SendMessageRequest,
  StartDmDto as StartDmRequest
} from '@livonit/shared';
