import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchProjects,
  fetchProject,
  createProject,
  updateProject,
  fetchProjectMembers,
  addProjectMember,
  removeProjectMember
} from '@/api/projects';
import type {
  CreateProjectRequest,
  UpdateProjectRequest,
  ProjectRole
} from '@/api/types';
import { organizationKeys } from './organizationQueries';

export const projectKeys = {
  all: ['projects'] as const,
  listByOrg: (orgId: string) =>
    [...organizationKeys.detail(orgId), 'projects'] as const,
  detail: (projectId: string) => [...projectKeys.all, projectId] as const,
  members: (projectId: string) =>
    [...projectKeys.detail(projectId), 'members'] as const,
  board: (projectId: string) =>
    [...projectKeys.detail(projectId), 'board'] as const,
  tickets: (projectId: string) =>
    [...projectKeys.detail(projectId), 'tickets'] as const
};

export function useProjectsQuery(orgId: string) {
  return useQuery({
    queryKey: projectKeys.listByOrg(orgId),
    queryFn: () => fetchProjects(orgId),
    enabled: !!orgId
  });
}

export function useProjectQuery(projectId: string) {
  return useQuery({
    queryKey: projectKeys.detail(projectId),
    queryFn: () => fetchProject(projectId),
    enabled: !!projectId
  });
}

export function useProjectMembersQuery(projectId: string) {
  return useQuery({
    queryKey: projectKeys.members(projectId),
    queryFn: () => fetchProjectMembers(projectId),
    enabled: !!projectId
  });
}

export function useCreateProjectMutation(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateProjectRequest) => createProject(orgId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.listByOrg(orgId)
      });
    }
  });
}

export function useUpdateProjectMutation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateProjectRequest) => updateProject(projectId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.detail(projectId)
      });
    }
  });
}

export function useAddProjectMemberMutation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: ProjectRole }) =>
      addProjectMember(projectId, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.members(projectId)
      });
    }
  });
}

export function useRemoveProjectMemberMutation(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeProjectMember(projectId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.members(projectId)
      });
    }
  });
}
