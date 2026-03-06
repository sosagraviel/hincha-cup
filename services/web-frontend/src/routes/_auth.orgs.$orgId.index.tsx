import { createFileRoute } from '@tanstack/react-router';
import { ProjectsPage } from '@/features/projects';

export const Route = createFileRoute('/_auth/orgs/$orgId/')({
  component: OrgIndexRoute
});

function OrgIndexRoute() {
  const { orgId } = Route.useParams();

  return <ProjectsPage orgId={orgId} />;
}
