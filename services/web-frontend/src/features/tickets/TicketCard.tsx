import { cn } from '@/shared/lib/utils';
import { Avatar } from '@/components/atoms/Avatar';
import { PriorityBadge } from './PriorityBadge';
import { Calendar } from 'lucide-react';
import type { Ticket } from '@/api/types';

interface TicketCardProps {
  ticket: Ticket;
  projectKey: string;
  onClick?: (ticket: Ticket) => void;
  className?: string;
}

function TicketCard({
  ticket,
  projectKey,
  onClick,
  className
}: TicketCardProps) {
  const formattedDate = ticket.dueDate
    ? new Date(ticket.dueDate).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      })
    : null;

  return (
    <div
      data-testid={`ticket-card-${ticket.id}`}
      className={cn(
        'bg-white rounded-md border border-zinc-200 p-3',
        'hover:border-zinc-300 transition-colors cursor-pointer',
        className
      )}
      onClick={() => onClick?.(ticket)}
    >
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[11px] font-semibold text-zinc-400">
          {projectKey}-{ticket.ticketNumber}
        </span>
        <PriorityBadge priority={ticket.priority} />
      </div>

      <h4 className="text-[13px] font-medium text-zinc-900 mb-2.5 line-clamp-2">
        {ticket.title}
      </h4>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {formattedDate && (
            <>
              <Calendar className="size-3 text-zinc-400" />
              <span className="text-[11px] text-zinc-400">{formattedDate}</span>
            </>
          )}
        </div>
        {ticket.assignee ? (
          <Avatar
            src={ticket.assignee.profilePictureUrl}
            alt={ticket.assignee.fullName}
            className="size-[22px]"
          />
        ) : (
          <div className="size-[22px]" />
        )}
      </div>
    </div>
  );
}

export { TicketCard };
