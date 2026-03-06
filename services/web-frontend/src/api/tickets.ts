import { getAuthenticatedApi } from '@/shared/lib/axios';
import type {
  Ticket,
  BoardColumn,
  PaginatedResponse,
  CreateTicketRequest,
  UpdateTicketRequest,
  MoveTicketRequest,
  TicketStatus,
  Priority
} from './types';

const STATUS_LABELS: Record<string, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done'
};

const STATUS_ORDER = ['backlog', 'todo', 'in_progress', 'in_review', 'done'];

export async function fetchBoard(projectId: string): Promise<BoardColumn[]> {
  const response = await getAuthenticatedApi().get<Record<string, Ticket[]>>(
    `/projects/${projectId}/board`
  );
  const board = response.data;

  return STATUS_ORDER.map(status => ({
    status: status as TicketStatus,
    label: STATUS_LABELS[status] || status,
    tickets: board[status] || []
  }));
}

export interface ListTicketsParams {
  page?: number;
  limit?: number;
  sort?: string;
  status?: TicketStatus;
  assigneeId?: string;
  priority?: Priority;
}

export async function fetchTickets(
  projectId: string,
  params?: ListTicketsParams
): Promise<PaginatedResponse<Ticket>> {
  const response = await getAuthenticatedApi().get(
    `/projects/${projectId}/tickets`,
    { params }
  );
  return response.data;
}

export async function fetchTicket(ticketId: string): Promise<Ticket> {
  const response = await getAuthenticatedApi().get(`/tickets/${ticketId}`);
  return response.data;
}

export async function createTicket(
  projectId: string,
  data: CreateTicketRequest
): Promise<Ticket> {
  const response = await getAuthenticatedApi().post(
    `/projects/${projectId}/tickets`,
    data
  );
  return response.data;
}

export async function updateTicket(
  ticketId: string,
  data: UpdateTicketRequest
): Promise<Ticket> {
  const response = await getAuthenticatedApi().patch(
    `/tickets/${ticketId}`,
    data
  );
  return response.data;
}

export async function moveTicket(
  ticketId: string,
  data: MoveTicketRequest
): Promise<Ticket> {
  const response = await getAuthenticatedApi().patch(
    `/tickets/${ticketId}/status`,
    data
  );
  return response.data;
}

export async function deleteTicket(ticketId: string): Promise<void> {
  await getAuthenticatedApi().delete(`/tickets/${ticketId}`);
}
