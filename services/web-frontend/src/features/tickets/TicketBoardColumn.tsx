import { BoardColumn } from '@/components/organisms/BoardColumn';
import { TicketCard } from './TicketCard';
import { statusDotColors } from './constants';
import type { BoardColumn as BoardColumnType, Ticket } from '@/api/types';

interface TicketBoardColumnProps {
  column: BoardColumnType;
  projectKey: string;
  onTicketClick?: (ticket: Ticket) => void;
}

function TicketBoardColumn({
  column,
  projectKey,
  onTicketClick
}: TicketBoardColumnProps) {
  return (
    <BoardColumn
      title={column.label}
      count={column.tickets.length}
      dotColor={statusDotColors[column.status]}
    >
      {column.tickets.map(ticket => (
        <TicketCard
          key={ticket.id}
          ticket={ticket}
          projectKey={projectKey}
          onClick={onTicketClick}
        />
      ))}
    </BoardColumn>
  );
}

export { TicketBoardColumn };
