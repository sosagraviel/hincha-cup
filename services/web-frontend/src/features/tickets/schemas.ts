import { z } from 'zod';
import { Priority, TicketStatus } from '@/api/types';

export const createTicketSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  priority: z.nativeEnum(Priority),
  status: z.nativeEnum(TicketStatus)
});

export type CreateTicketFormValues = z.infer<typeof createTicketSchema>;
