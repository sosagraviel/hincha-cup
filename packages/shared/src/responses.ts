import { TicketStatus, Priority, OrgRole, ProjectRole } from './enums';

/** API response: User entity */
export interface User {
  id: string;
  externalId: string;
  email: string;
  fullName: string;
  profilePictureUrl?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/** API response: Organization entity */
export interface Organization {
  id: string;
  name: string;
  slug: string;
  description?: string;
  logoUrl?: string;
  createdAt: string;
  updatedAt: string;
}

/** API response: Organization member with optional nested user */
export interface OrganizationMember {
  id: string;
  userId: string;
  organizationId: string;
  role: OrgRole;
  createdAt: string;
  user?: User;
}

/** API response: Project entity */
export interface Project {
  id: string;
  organizationId: string;
  name: string;
  key: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

/** API response: Project member with optional nested user */
export interface ProjectMember {
  id: string;
  userId: string;
  projectId: string;
  role: ProjectRole;
  createdAt: string;
  user?: User;
}

/** API response: Ticket entity with optional relations */
export interface Ticket {
  id: string;
  projectId: string;
  ticketNumber: number;
  title: string;
  description?: string;
  status: TicketStatus;
  priority: Priority;
  assigneeId?: string | null;
  reporterId: string;
  order: number;
  dueDate?: string | null;
  createdAt: string;
  updatedAt: string;
  assignee?: User;
  reporter?: User;
  project?: Project;
  comments?: Comment[];
}

/** API response: Comment entity with optional nested author */
export interface Comment {
  id: string;
  ticketId: string;
  authorId: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  author?: User;
}

/** Board column for the Kanban view */
export interface BoardColumn {
  status: TicketStatus;
  label: string;
  tickets: Ticket[];
}

/** Paginated API response wrapper */
export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
