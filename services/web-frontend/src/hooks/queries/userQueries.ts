import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchCurrentUser,
  updateUserProfile,
  getProfilePicturePresignedUrl
} from '@/api/users';

export const userKeys = {
  all: ['users'] as const,
  me: () => [...userKeys.all, 'me'] as const
};

export function useCurrentUserQuery() {
  return useQuery({
    queryKey: userKeys.me(),
    queryFn: fetchCurrentUser
  });
}

export function useUpdateUserProfileMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      userId,
      fullName,
      profilePictureUrl
    }: {
      userId: string;
      fullName: string;
      profilePictureUrl?: string;
    }) => updateUserProfile(userId, { fullName, profilePictureUrl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.me() });
    }
  });
}

export function useProfilePicturePresignedUrlMutation() {
  return useMutation({
    mutationFn: getProfilePicturePresignedUrl
  });
}
