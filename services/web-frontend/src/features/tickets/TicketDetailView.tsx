import { DetailPanel } from '@/components/organisms/DetailPanel';
import { StatusBadge } from './StatusBadge';
import { PriorityBadge } from './PriorityBadge';
import { DateDisplay } from '@/components/atoms/DateDisplay';
import { UserAvatar } from '@/components/molecules/UserAvatar';
import { useTicketQuery } from '@/hooks/queries/ticketQueries';
import { useCreateCommentMutation } from '@/hooks/queries/ticketQueries';
import { TicketCommentSection } from './TicketCommentSection';

interface TicketDetailViewProps {
  ticketId: string | null;
  projectKey: string;
  onClose: () => void;
}

function TicketDetailView({
  ticketId,
  projectKey,
  onClose
}: TicketDetailViewProps) {
  const { data: ticket, isLoading } = useTicketQuery(ticketId || '');
  const createComment = useCreateCommentMutation(ticketId || '');

  const handleAddComment = (content: string) => {
    createComment.mutate(content);
  };

  return (
    <DetailPanel
      open={!!ticketId}
      onClose={onClose}
      isLoading={isLoading || !ticket}
    >
      {ticket && (
        <>
          <DetailPanel.Header>
            <span className="text-xs font-medium text-zinc-500">
              {projectKey}-{ticket.ticketNumber}
            </span>
            <StatusBadge status={ticket.status} />
          </DetailPanel.Header>
          <DetailPanel.Title>{ticket.title}</DetailPanel.Title>

          {ticket.description && (
            <DetailPanel.Section title="Description">
              <p className="text-sm text-zinc-700 whitespace-pre-wrap">
                {ticket.description}
              </p>
            </DetailPanel.Section>
          )}

          <DetailPanel.Grid>
            <DetailPanel.Field label="Priority">
              <PriorityBadge priority={ticket.priority} />
            </DetailPanel.Field>
            <DetailPanel.Field label="Assignee">
              <UserAvatar user={ticket.assignee} size="sm" />
            </DetailPanel.Field>
            <DetailPanel.Field label="Reporter">
              <UserAvatar user={ticket.reporter} size="sm" />
            </DetailPanel.Field>
            {ticket.dueDate && (
              <DetailPanel.Field label="Due Date">
                <DateDisplay date={ticket.dueDate} />
              </DetailPanel.Field>
            )}
          </DetailPanel.Grid>

          <DetailPanel.Section
            title={`Comments (${ticket.comments?.length || 0})`}
          >
            <TicketCommentSection
              comments={ticket.comments || []}
              onAddComment={handleAddComment}
              isPending={createComment.isPending}
            />
          </DetailPanel.Section>
        </>
      )}
    </DetailPanel>
  );
}

export { TicketDetailView };
