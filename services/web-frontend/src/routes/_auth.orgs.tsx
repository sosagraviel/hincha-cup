import { createFileRoute, Outlet } from '@tanstack/react-router';

export const Route = createFileRoute('/_auth/orgs')({
  component: OrgsLayout
});

function OrgsLayout() {
  return <Outlet />;
}
