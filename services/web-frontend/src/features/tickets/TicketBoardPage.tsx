import { useState } from 'react';
import { useProjectQuery } from '@/hooks/queries/projectQueries';
import { useBoardQuery } from '@/hooks/queries/ticketQueries';
import { GenericLoader } from '@/shared/ui/generic-loader';
import { Plus, SlidersHorizontal, Columns3 } from 'lucide-react';
import { TicketDetailView } from './TicketDetailView';
import { CreateTicketDialog } from './CreateTicketDialog';
import { TicketBoardColumn } from './TicketBoardColumn';
import type { Ticket } from '@/api/types';

interface TicketBoardPageProps {
  projectId: string;
}

function TicketBoardPage({ projectId }: TicketBoardPageProps) {
  const { data: project, isLoading: projectLoading } =
    useProjectQuery(projectId);
  const { data: columns, isLoading: boardLoading } = useBoardQuery(projectId);

  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const handleTicketClick = (ticket: Ticket) => {
    setSelectedTicketId(ticket.id);
  };

  const totalTickets =
    columns?.reduce((sum, col) => sum + col.tickets.length, 0) ?? 0;

  if (projectLoading || boardLoading) {
    return <GenericLoader />;
  }

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Board toolbar */}
        <div className="flex items-center gap-3 px-6 h-11 border-b border-zinc-200 bg-white">
          <button className="flex items-center gap-1.5 h-7 px-2.5 rounded border border-zinc-200 text-xs font-medium text-zinc-500 hover:border-zinc-300 transition-colors">
            <SlidersHorizontal className="size-[13px]" />
            Filter
          </button>
          <button className="flex items-center gap-1.5 h-7 px-2.5 rounded border border-zinc-200 text-xs font-medium text-zinc-500 hover:border-zinc-300 transition-colors">
            <Columns3 className="size-[13px]" />
            Group by: Status
          </button>
          <span className="text-xs text-zinc-400">
            {totalTickets} ticket{totalTickets !== 1 ? 's' : ''}
          </span>
          <div className="flex-1" />
          <button
            data-testid="create-ticket-button"
            onClick={() => setCreateDialogOpen(true)}
            className="flex items-center gap-1.5 h-8 px-3.5 rounded-md bg-blue-600 text-white text-[13px] font-semibold hover:bg-blue-700 transition-colors"
          >
            <Plus className="size-3.5" />
            Create Ticket
          </button>
        </div>

        {/* Board columns */}
        <div className="flex-1 overflow-x-auto p-5 bg-zinc-50">
          <div className="flex gap-4 h-full min-h-0">
            {columns?.map(column => (
              <TicketBoardColumn
                key={column.status}
                column={column}
                projectKey={project?.key || ''}
                onTicketClick={handleTicketClick}
              />
            ))}
          </div>
        </div>
      </div>

      <TicketDetailView
        ticketId={selectedTicketId}
        projectKey={project?.key || ''}
        onClose={() => setSelectedTicketId(null)}
      />

      <CreateTicketDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        projectId={projectId}
      />
    </>
  );
}

export { TicketBoardPage };
