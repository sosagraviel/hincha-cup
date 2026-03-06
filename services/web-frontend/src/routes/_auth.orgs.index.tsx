import { createFileRoute } from '@tanstack/react-router';
import { DashboardLayout } from '@/components/layouts/DashboardLayout';
import { OrganizationsPage } from '@/features/organizations';

export const Route = createFileRoute('/_auth/orgs/')({
  component: OrgsIndexRoute
});

function OrgsIndexRoute() {
  return (
    <DashboardLayout>
      <OrganizationsPage />
    </DashboardLayout>
  );
}
