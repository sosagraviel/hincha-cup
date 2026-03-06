import { Priority, TicketStatus } from '@/api/types';
import type { FieldConfig } from '@/components/molecules/SchemaForm';
import type { CreateTicketFormValues } from './schemas';

export const priorityOptions = [
  { label: 'Low', value: Priority.LOW },
  { label: 'Medium', value: Priority.MEDIUM },
  { label: 'High', value: Priority.HIGH },
  { label: 'Critical', value: Priority.CRITICAL }
];

export const statusOptions = [
  { label: 'Backlog', value: TicketStatus.BACKLOG },
  { label: 'Todo', value: TicketStatus.TODO },
  { label: 'In Progress', value: TicketStatus.IN_PROGRESS }
];

export const createTicketFields: FieldConfig<CreateTicketFormValues>[] = [
  {
    name: 'title',
    label: 'Title',
    type: 'text',
    placeholder: 'What needs to be done?'
  },
  {
    name: 'description',
    label: 'Description',
    type: 'textarea',
    placeholder: 'Add more details...'
  },
  {
    name: 'priority',
    label: 'Priority',
    type: 'select',
    options: priorityOptions
  },
  {
    name: 'status',
    label: 'Status',
    type: 'select',
    options: statusOptions
  }
];
