import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchRooms,
  fetchRoom,
  createRoom,
  fetchRoomMessages,
  sendMessage,
  deleteMessage,
  fetchDmThreads,
  startDmThread,
  fetchDmMessages
} from '@/api/chat';
import type { CreateRoomRequest, SendMessageRequest } from '@/api/types';

export const chatKeys = {
  all: ['chat'] as const,
  rooms: (orgId: string) => [...chatKeys.all, 'rooms', orgId] as const,
  room: (roomId: string) => [...chatKeys.all, 'room', roomId] as const,
  roomMessages: (roomId: string) =>
    [...chatKeys.all, 'room-messages', roomId] as const,
  dmThreads: () => [...chatKeys.all, 'dm-threads'] as const,
  dmMessages: (dmThreadId: string) =>
    [...chatKeys.all, 'dm-messages', dmThreadId] as const
};

export function useRoomsQuery(organizationId: string) {
  return useQuery({
    queryKey: chatKeys.rooms(organizationId),
    queryFn: () => fetchRooms(organizationId),
    enabled: !!organizationId
  });
}

export function useRoomQuery(roomId: string) {
  return useQuery({
    queryKey: chatKeys.room(roomId),
    queryFn: () => fetchRoom(roomId),
    enabled: !!roomId
  });
}

export function useRoomMessagesQuery(roomId: string) {
  return useQuery({
    queryKey: chatKeys.roomMessages(roomId),
    queryFn: () => fetchRoomMessages(roomId),
    enabled: !!roomId,
    refetchInterval: 10000
  });
}

export function useDmThreadsQuery() {
  return useQuery({
    queryKey: chatKeys.dmThreads(),
    queryFn: fetchDmThreads
  });
}

export function useDmMessagesQuery(dmThreadId: string) {
  return useQuery({
    queryKey: chatKeys.dmMessages(dmThreadId),
    queryFn: () => fetchDmMessages(dmThreadId),
    enabled: !!dmThreadId,
    refetchInterval: 10000
  });
}

export function useCreateRoomMutation(organizationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateRoomRequest) => createRoom(data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: chatKeys.rooms(organizationId)
      });
    }
  });
}

export function useSendMessageMutation(
  contextId: string,
  contextType: 'room' | 'dm'
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: SendMessageRequest) => sendMessage(data),
    onSuccess: () => {
      const key =
        contextType === 'room'
          ? chatKeys.roomMessages(contextId)
          : chatKeys.dmMessages(contextId);
      queryClient.invalidateQueries({ queryKey: key });
    }
  });
}

export function useDeleteMessageMutation(
  contextId: string,
  contextType: 'room' | 'dm'
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (messageId: string) => deleteMessage(messageId),
    onSuccess: () => {
      const key =
        contextType === 'room'
          ? chatKeys.roomMessages(contextId)
          : chatKeys.dmMessages(contextId);
      queryClient.invalidateQueries({ queryKey: key });
    }
  });
}

export function useStartDmMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (otherUserId: string) => startDmThread(otherUserId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: chatKeys.dmThreads() });
    }
  });
}
