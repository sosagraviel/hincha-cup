import { createFileRoute } from '@tanstack/react-router';
import { ChatPage } from '@/features/chat';

export const Route = createFileRoute('/_auth/orgs/$orgId/chat')({
  component: ChatRoute
});

function ChatRoute() {
  const { orgId } = Route.useParams();

  return <ChatPage organizationId={orgId} />;
}
