export interface ChatRoom {
  id: string;
  name: string;
  description?: string;
  organizationId: string;
  createdBy: string;
  createdAt: string;
  isPublic: boolean;
  metadata?: Record<string, unknown>;
}
