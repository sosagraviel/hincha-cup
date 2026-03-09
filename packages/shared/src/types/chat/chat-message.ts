import type { User } from '../../responses';

export interface ChatMessage {
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
}
