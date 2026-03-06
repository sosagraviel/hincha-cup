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
  PaginatedResponse
} from '@livonit/shared';

// Request DTOs (classes with validation in backend, but frontend uses as types)
export type {
  CreateTicketDto as CreateTicketRequest,
  UpdateTicketDto as UpdateTicketRequest,
  MoveTicketDto as MoveTicketRequest,
  CreateProjectDto as CreateProjectRequest,
  UpdateProjectDto as UpdateProjectRequest,
  CreateOrganizationDto as CreateOrganizationRequest,
  UpdateOrganizationDto as UpdateOrganizationRequest
} from '@livonit/shared';

// ---- Chat types (to be added to shared package) ----

export type ChatRoom = {
  id: string;
  name: string;
  description?: string;
  organizationId: string;
  createdBy: string;
  createdAt: string;
  isPublic: boolean;
  metadata?: Record<string, unknown>;
};

export type ChatMessage = {
  id: string;
  content: string;
  messageType: 'text' | 'image' | 'file' | 'system';
  createdAt: string;
  updatedAt?: string;
  deletedAt?: string;
  senderId: string;
  roomId?: string;
  groupId?: string;
  dmThreadId?: string;
  parentMessageId?: string;
  metadata?: Record<string, unknown>;
  sender?: User;
};

export type DmThread = {
  id: string;
  user1Id: string;
  user2Id: string;
  createdAt: string;
  user1?: User;
  user2?: User;
};

export type CreateRoomRequest = {
  name: string;
  organizationId: string;
  description?: string;
  isPublic?: boolean;
};

export type SendMessageRequest = {
  content: string;
  roomId?: string;
  groupId?: string;
  dmThreadId?: string;
  parentMessageId?: string;
};
