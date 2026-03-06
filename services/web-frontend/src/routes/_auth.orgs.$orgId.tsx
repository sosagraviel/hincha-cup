import { createFileRoute, Outlet } from '@tanstack/react-router';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { useOrgSubscription } from '@/hooks/useOrgSubscription';

export const Route = createFileRoute('/_auth/orgs/$orgId')({
  component: OrgLayout
});

function OrgLayout() {
  const { orgId } = Route.useParams();

  // Join organization-specific WebSocket room
  useOrgSubscription(orgId);

  return (
    <DashboardLayout>
      <Outlet />
    </DashboardLayout>
  );
}
