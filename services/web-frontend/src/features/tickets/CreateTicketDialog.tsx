import { FormDialog } from '@/components/organisms/FormDialog';
import { useCreateTicketMutation } from '@/hooks/queries/ticketQueries';
import { Priority, TicketStatus } from '@/api/types';
import type { CreateTicketRequest } from '@/api/types';
import { createTicketSchema } from './schemas';
import type { CreateTicketFormValues } from './schemas';
import { createTicketFields } from './field-configs';

interface CreateTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

function CreateTicketDialog({
  open,
  onOpenChange,
  projectId
}: CreateTicketDialogProps) {
  const createTicket = useCreateTicketMutation(projectId);

  const handleSubmit = (data: CreateTicketFormValues) => {
    const request: CreateTicketRequest = {
      title: data.title,
      description: data.description,
      priority: data.priority,
      status: data.status
    };
    createTicket.mutate(request, {
      onSuccess: () => onOpenChange(false)
    });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create New Ticket"
      schema={createTicketSchema}
      fields={createTicketFields}
      defaultValues={{ priority: Priority.MEDIUM, status: TicketStatus.TODO }}
      onSubmit={handleSubmit}
      isPending={createTicket.isPending}
      submitLabel="Create Ticket"
    />
  );
}

export { CreateTicketDialog };
