import { getAuthenticatedApi } from '@/shared/lib/axios';
import type {
  Organization,
  OrganizationMember,
  OrgRole,
  CreateOrganizationRequest,
  UpdateOrganizationRequest
} from './types';

export async function fetchOrganizations(): Promise<Organization[]> {
  const response = await getAuthenticatedApi().get('/organizations');
  return response.data;
}

export async function fetchOrganization(orgId: string): Promise<Organization> {
  const response = await getAuthenticatedApi().get(`/organizations/${orgId}`);
  return response.data;
}

export async function createOrganization(
  data: CreateOrganizationRequest
): Promise<Organization> {
  const response = await getAuthenticatedApi().post('/organizations', data);
  return response.data;
}

export async function updateOrganization(
  orgId: string,
  data: UpdateOrganizationRequest
): Promise<Organization> {
  const response = await getAuthenticatedApi().patch(
    `/organizations/${orgId}`,
    data
  );
  return response.data;
}

export async function fetchOrganizationMembers(
  orgId: string
): Promise<OrganizationMember[]> {
  const response = await getAuthenticatedApi().get(
    `/organizations/${orgId}/members`
  );
  return response.data;
}

export async function addOrganizationMember(
  orgId: string,
  userId: string,
  role: OrgRole
): Promise<OrganizationMember> {
  const response = await getAuthenticatedApi().post(
    `/organizations/${orgId}/members`,
    { userId, role }
  );
  return response.data;
}

export async function updateOrganizationMemberRole(
  orgId: string,
  userId: string,
  role: OrgRole
): Promise<OrganizationMember> {
  const response = await getAuthenticatedApi().patch(
    `/organizations/${orgId}/members/${userId}`,
    { role }
  );
  return response.data;
}

export async function removeOrganizationMember(
  orgId: string,
  userId: string
): Promise<void> {
  await getAuthenticatedApi().delete(
    `/organizations/${orgId}/members/${userId}`
  );
}
