import { getAuthenticatedApi } from '@/shared/lib/axios';
import type { Comment } from './types';

export async function createComment(
  ticketId: string,
  content: string
): Promise<Comment> {
  const response = await getAuthenticatedApi().post(
    `/tickets/${ticketId}/comments`,
    { content }
  );
  return response.data;
}

export async function updateComment(
  commentId: string,
  content: string
): Promise<Comment> {
  const response = await getAuthenticatedApi().patch(`/comments/${commentId}`, {
    content
  });
  return response.data;
}

export async function deleteComment(commentId: string): Promise<void> {
  await getAuthenticatedApi().delete(`/comments/${commentId}`);
}
