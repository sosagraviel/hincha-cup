import type { z } from 'zod';
import type { DefaultValues, FieldValues } from 'react-hook-form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/shared/ui/dialog';
import { Button } from '@/shared/ui/button';
import { SchemaForm } from '@/components/molecules/SchemaForm';
import type { FieldConfig } from '@/components/molecules/SchemaForm';
import { cn } from '@/shared/lib/utils';

interface FormDialogProps<TValues extends FieldValues> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  schema: z.ZodType<TValues>;
  fields: FieldConfig<TValues>[];
  defaultValues?: DefaultValues<TValues>;
  onSubmit: (data: TValues) => void;
  isPending?: boolean;
  submitLabel?: string;
  columns?: 1 | 2;
  className?: string;
}

function FormDialog<TValues extends FieldValues>({
  open,
  onOpenChange,
  title,
  description,
  schema,
  fields,
  defaultValues,
  onSubmit,
  isPending,
  submitLabel = 'Create',
  columns,
  className
}: FormDialogProps<TValues>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn('sm:max-w-md', className)}
        aria-describedby={description ? 'form-dialog-description' : undefined}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && (
            <DialogDescription id="form-dialog-description">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        <SchemaForm
          id="form-dialog-form"
          schema={schema}
          fields={fields}
          defaultValues={defaultValues}
          onSubmit={onSubmit}
          isPending={isPending}
          columns={columns}
          footer={
            <DialogFooter className="mt-6">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                form="form-dialog-form"
                disabled={isPending}
                isLoading={isPending}
              >
                {submitLabel}
              </Button>
            </DialogFooter>
          }
        />
      </DialogContent>
    </Dialog>
  );
}

export { FormDialog };
