import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchOrganizations,
  fetchOrganization,
  createOrganization,
  updateOrganization,
  fetchOrganizationMembers,
  addOrganizationMember,
  updateOrganizationMemberRole,
  removeOrganizationMember
} from '@/api/organizations';
import type {
  CreateOrganizationRequest,
  UpdateOrganizationRequest,
  OrgRole
} from '@/api/types';

export const organizationKeys = {
  all: ['organizations'] as const,
  lists: () => [...organizationKeys.all, 'list'] as const,
  detail: (orgId: string) => [...organizationKeys.all, orgId] as const,
  members: (orgId: string) =>
    [...organizationKeys.detail(orgId), 'members'] as const
};

export function useOrganizationsQuery() {
  return useQuery({
    queryKey: organizationKeys.lists(),
    queryFn: fetchOrganizations
  });
}

export function useOrganizationQuery(orgId: string) {
  return useQuery({
    queryKey: organizationKeys.detail(orgId),
    queryFn: () => fetchOrganization(orgId),
    enabled: !!orgId
  });
}

export function useOrganizationMembersQuery(orgId: string) {
  return useQuery({
    queryKey: organizationKeys.members(orgId),
    queryFn: () => fetchOrganizationMembers(orgId),
    enabled: !!orgId
  });
}

export function useCreateOrganizationMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateOrganizationRequest) => createOrganization(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.all });
    }
  });
}

export function useUpdateOrganizationMutation(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateOrganizationRequest) =>
      updateOrganization(orgId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: organizationKeys.all });
    }
  });
}

export function useAddOrgMemberMutation(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: OrgRole }) =>
      addOrganizationMember(orgId, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.members(orgId)
      });
    }
  });
}

export function useUpdateOrgMemberRoleMutation(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: OrgRole }) =>
      updateOrganizationMemberRole(orgId, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.members(orgId)
      });
    }
  });
}

export function useRemoveOrgMemberMutation(orgId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeOrganizationMember(orgId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: organizationKeys.members(orgId)
      });
    }
  });
}
