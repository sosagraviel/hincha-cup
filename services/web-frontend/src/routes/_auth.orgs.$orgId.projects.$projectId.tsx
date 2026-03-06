import { createFileRoute } from '@tanstack/react-router';
import { TicketBoardPage } from '@/features/tickets';
import { useChannelSubscription } from '@/hooks/useChannelSubscription';

export const Route = createFileRoute('/_auth/orgs/$orgId/projects/$projectId')({
  component: BoardRoute
});

function BoardRoute() {
  const { projectId } = Route.useParams();

  // Subscribe to project channels for real-time updates
  useChannelSubscription('project', projectId);

  return <TicketBoardPage projectId={projectId} />;
}
