import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { TicketStatus } from '@/api/types';

const statusConfig: Record<TicketStatus, { label: string; className: string }> =
  {
    [TicketStatus.BACKLOG]: {
      label: 'Backlog',
      className: 'bg-gray-100 text-gray-700 border-gray-200'
    },
    [TicketStatus.TODO]: {
      label: 'Todo',
      className: 'bg-blue-50 text-blue-700 border-blue-200'
    },
    [TicketStatus.IN_PROGRESS]: {
      label: 'In Progress',
      className: 'bg-yellow-50 text-yellow-700 border-yellow-200'
    },
    [TicketStatus.IN_REVIEW]: {
      label: 'In Review',
      className: 'bg-purple-50 text-purple-700 border-purple-200'
    },
    [TicketStatus.DONE]: {
      label: 'Done',
      className: 'bg-green-50 text-green-700 border-green-200'
    }
  };

interface StatusBadgeProps {
  status: TicketStatus;
  className?: string;
}

function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <Badge
      variant="outline"
      className={cn('text-xs font-medium', config.className, className)}
    >
      {config.label}
    </Badge>
  );
}

export { StatusBadge };
