import { getAuthenticatedApi } from '@/shared/lib/axios';
import type { User } from './types';

export async function fetchCurrentUser(): Promise<User> {
  const response = await getAuthenticatedApi().get('/users/me');
  return response.data;
}

export async function updateUserProfile(
  userId: string,
  body: { fullName: string; profilePictureUrl?: string }
): Promise<User> {
  const response = await getAuthenticatedApi().put(`/users/${userId}`, body);
  return response.data;
}

export async function getProfilePicturePresignedUrl(): Promise<{
  presignedUrl: string;
}> {
  const response = await getAuthenticatedApi().post(
    '/users/me/profile-picture'
  );
  return response.data;
}
