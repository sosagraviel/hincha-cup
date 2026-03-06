import {
  createRootRouteWithContext,
  Outlet,
  useParams
} from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import type { KeycloakContextType } from '@/shared/context/keycloak';
import { useCurrentUserQuery } from '@/hooks/queries/userQueries';
import { useOrganizationQuery } from '@/hooks/queries/organizationQueries';
import { useProjectQuery } from '@/hooks/queries/projectQueries';
import { useWebSocketSubscription } from '@/hooks/useWebSocketSubscription';
import { GenericLoader } from '@/shared/ui/generic-loader';
import { Header } from '@/components/organisms/Header';

function RootComponent() {
  const { data: user, isLoading } = useCurrentUserQuery();
  const params = useParams({ strict: false }) as {
    orgId?: string;
    projectId?: string;
  };

  const { data: organization } = useOrganizationQuery(params.orgId ?? '');
  const { data: project } = useProjectQuery(params.projectId ?? '');

  // Mount global WebSocket subscription (cache updater + recovery refetch)
  useWebSocketSubscription();

  if (isLoading || !user) {
    return <GenericLoader />;
  }

  const breadcrumb = {
    orgName: organization?.name,
    projectName: project?.name
  };

  return (
    <div className="flex flex-col h-screen">
      <Header user={user} breadcrumb={breadcrumb} />
      <Outlet />
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </div>
  );
}

export const Route = createRootRouteWithContext<{
  auth: KeycloakContextType;
}>()({
  component: RootComponent
});
