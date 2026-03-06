import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchBoard,
  fetchTickets,
  fetchTicket,
  createTicket,
  updateTicket,
  moveTicket,
  deleteTicket,
  type ListTicketsParams
} from '@/api/tickets';
import { createComment, updateComment, deleteComment } from '@/api/comments';
import type {
  CreateTicketRequest,
  UpdateTicketRequest,
  MoveTicketRequest
} from '@/api/types';
import { projectKeys } from './projectQueries';

export const ticketKeys = {
  all: ['tickets'] as const,
  detail: (ticketId: string) => [...ticketKeys.all, ticketId] as const
};

export function useBoardQuery(projectId: string) {
  return useQuery({
    queryKey: projectKeys.board(projectId),
    queryFn: () => fetchBoard(projectId),
    enabled: !!projectId
  });
}

export function useTicketsQuery(projectId: string, params?: ListTicketsParams) {
  return useQuery({
    queryKey: [...projectKeys.tickets(projectId), params],
    queryFn: () => fetchTickets(projectId, params),
    enabled: !!projectId
  });
}

export function useTicketQuery(ticketId: string) {
  return useQuery({
    queryKey: ticketKeys.detail(ticketId),
    queryFn: () => fetchTicket(ticketId),
    enabled: !!ticketId
  });
}

export function useCreateTicketMutation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateTicketRequest) => createTicket(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.board(projectId)
      });
      queryClient.invalidateQueries({
        queryKey: projectKeys.tickets(projectId)
      });
    }
  });
}

export function useUpdateTicketMutation(ticketId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateTicketRequest) => updateTicket(ticketId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ticketKeys.detail(ticketId)
      });
      queryClient.invalidateQueries({
        queryKey: projectKeys.board(projectId)
      });
    }
  });
}

export function useMoveTicketMutation(ticketId: string, projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: MoveTicketRequest) => moveTicket(ticketId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.board(projectId)
      });
    }
  });
}

export function useDeleteTicketMutation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ticketId: string) => deleteTicket(ticketId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.board(projectId)
      });
      queryClient.invalidateQueries({
        queryKey: projectKeys.tickets(projectId)
      });
    }
  });
}

// Comment mutations
export function useCreateCommentMutation(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (content: string) => createComment(ticketId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ticketKeys.detail(ticketId)
      });
    }
  });
}

export function useUpdateCommentMutation(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      commentId,
      content
    }: {
      commentId: string;
      content: string;
    }) => updateComment(commentId, content),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ticketKeys.detail(ticketId)
      });
    }
  });
}

export function useDeleteCommentMutation(ticketId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => deleteComment(commentId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ticketKeys.detail(ticketId)
      });
    }
  });
}
