import { getAuthenticatedApi } from '@/shared/lib/axios';
import type {
  Project,
  ProjectMember,
  ProjectRole,
  CreateProjectRequest,
  UpdateProjectRequest
} from './types';

export async function fetchProjects(orgId: string): Promise<Project[]> {
  const response = await getAuthenticatedApi().get(
    `/organizations/${orgId}/projects`
  );
  return response.data;
}

export async function fetchProject(projectId: string): Promise<Project> {
  const response = await getAuthenticatedApi().get(`/projects/${projectId}`);
  return response.data;
}

export async function createProject(
  orgId: string,
  data: CreateProjectRequest
): Promise<Project> {
  const response = await getAuthenticatedApi().post(
    `/organizations/${orgId}/projects`,
    data
  );
  return response.data;
}

export async function updateProject(
  projectId: string,
  data: UpdateProjectRequest
): Promise<Project> {
  const response = await getAuthenticatedApi().patch(
    `/projects/${projectId}`,
    data
  );
  return response.data;
}

export async function fetchProjectMembers(
  projectId: string
): Promise<ProjectMember[]> {
  const response = await getAuthenticatedApi().get(
    `/projects/${projectId}/members`
  );
  return response.data;
}

export async function addProjectMember(
  projectId: string,
  userId: string,
  role: ProjectRole
): Promise<ProjectMember> {
  const response = await getAuthenticatedApi().post(
    `/projects/${projectId}/members`,
    { userId, role }
  );
  return response.data;
}

export async function removeProjectMember(
  projectId: string,
  userId: string
): Promise<void> {
  await getAuthenticatedApi().delete(
    `/projects/${projectId}/members/${userId}`
  );
}
