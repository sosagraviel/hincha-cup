import { TicketStatus } from '@/api/types';

export const statusDotColors: Record<TicketStatus, string> = {
  [TicketStatus.BACKLOG]: 'bg-zinc-400',
  [TicketStatus.TODO]: 'bg-blue-600',
  [TicketStatus.IN_PROGRESS]: 'bg-amber-500',
  [TicketStatus.IN_REVIEW]: 'bg-violet-500',
  [TicketStatus.DONE]: 'bg-green-500'
};
