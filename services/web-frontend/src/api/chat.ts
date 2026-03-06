import { getAuthenticatedApi } from '@/shared/lib/axios';
import type {
  ChatRoom,
  ChatMessage,
  DmThread,
  CreateRoomRequest,
  SendMessageRequest
} from './types';

// ---- Rooms ----

export async function fetchRooms(organizationId: string): Promise<ChatRoom[]> {
  const response = await getAuthenticatedApi().get('/chat/rooms', {
    params: { organizationId }
  });
  return response.data;
}

export async function fetchRoom(roomId: string): Promise<ChatRoom> {
  const response = await getAuthenticatedApi().get(`/chat/rooms/${roomId}`);
  return response.data;
}

export async function createRoom(data: CreateRoomRequest): Promise<ChatRoom> {
  const response = await getAuthenticatedApi().post('/chat/rooms', data);
  return response.data;
}

export async function fetchRoomMessages(
  roomId: string,
  params?: { limit?: number; before?: string }
): Promise<ChatMessage[]> {
  const response = await getAuthenticatedApi().get(
    `/chat/rooms/${roomId}/messages`,
    { params }
  );
  return response.data;
}

// ---- Messages ----

export async function sendMessage(
  data: SendMessageRequest
): Promise<ChatMessage> {
  const response = await getAuthenticatedApi().post('/chat/messages', data);
  return response.data;
}

export async function deleteMessage(messageId: string): Promise<void> {
  await getAuthenticatedApi().delete(`/chat/messages/${messageId}`);
}

export async function markMessageAsRead(messageId: string): Promise<void> {
  await getAuthenticatedApi().post(`/chat/messages/${messageId}/read`);
}

// ---- DM Threads ----

export async function fetchDmThreads(): Promise<DmThread[]> {
  const response = await getAuthenticatedApi().get('/chat/dms');
  return response.data;
}

export async function startDmThread(otherUserId: string): Promise<DmThread> {
  const response = await getAuthenticatedApi().post('/chat/dms', {
    otherUserId
  });
  return response.data;
}

export async function fetchDmMessages(
  dmThreadId: string,
  params?: { limit?: number; before?: string }
): Promise<ChatMessage[]> {
  const response = await getAuthenticatedApi().get(
    `/chat/dms/${dmThreadId}/messages`,
    { params }
  );
  return response.data;
}
