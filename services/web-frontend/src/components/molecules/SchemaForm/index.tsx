import {
  useForm,
  Controller,
  type DefaultValues,
  type FieldValues,
  type Path
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/shared/ui/select';
import { Button } from '@/shared/ui/button';
import { FormField } from '@/components/atoms/FormField';
import { cn } from '@/shared/lib/utils';

type FieldType = 'text' | 'textarea' | 'select' | 'number' | 'date';

interface SelectOption {
  label: string;
  value: string;
}

interface FieldConfig<T> {
  name: keyof T & string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: SelectOption[];
  colSpan?: 1 | 2;
}

interface SchemaFormProps<TValues extends FieldValues> {
  schema: z.ZodType<TValues>;
  fields: FieldConfig<TValues>[];
  onSubmit: (data: TValues) => void;
  defaultValues?: DefaultValues<TValues>;
  isPending?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
  onCancel?: () => void;
  columns?: 1 | 2;
  footer?: React.ReactNode;
  id?: string;
}

function SchemaForm<TValues extends FieldValues>({
  schema,
  fields,
  onSubmit,
  defaultValues,
  isPending,
  submitLabel = 'Submit',
  cancelLabel = 'Cancel',
  onCancel,
  columns = 1,
  footer,
  id
}: SchemaFormProps<TValues>) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors }
  } = useForm<TValues>({
    resolver: zodResolver(schema),
    defaultValues
  });

  const renderField = (field: FieldConfig<TValues>) => {
    const fieldPath = field.name as Path<TValues>;
    const error = errors[field.name]?.message as string | undefined;

    switch (field.type) {
      case 'textarea':
        return (
          <FormField
            key={field.name}
            label={field.label}
            error={error}
            className={
              field.colSpan === 2 && columns === 2 ? 'col-span-2' : undefined
            }
          >
            <Textarea
              {...register(fieldPath)}
              placeholder={field.placeholder}
              rows={3}
              className="resize-none"
            />
          </FormField>
        );

      case 'select':
        return (
          <FormField
            key={field.name}
            label={field.label}
            error={error}
            className={
              field.colSpan === 2 && columns === 2 ? 'col-span-2' : undefined
            }
          >
            <Controller
              name={fieldPath}
              control={control}
              render={({ field: controllerField }) => (
                <Select
                  value={controllerField.value as string}
                  onValueChange={controllerField.onChange}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={field.placeholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {field.options?.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </FormField>
        );

      case 'number':
        return (
          <FormField
            key={field.name}
            label={field.label}
            error={error}
            className={
              field.colSpan === 2 && columns === 2 ? 'col-span-2' : undefined
            }
          >
            <Input
              type="number"
              {...register(fieldPath, { valueAsNumber: true })}
              placeholder={field.placeholder}
            />
          </FormField>
        );

      case 'date':
        return (
          <FormField
            key={field.name}
            label={field.label}
            error={error}
            className={
              field.colSpan === 2 && columns === 2 ? 'col-span-2' : undefined
            }
          >
            <Input
              type="date"
              {...register(fieldPath)}
              placeholder={field.placeholder}
            />
          </FormField>
        );

      default:
        return (
          <FormField
            key={field.name}
            label={field.label}
            error={error}
            className={
              field.colSpan === 2 && columns === 2 ? 'col-span-2' : undefined
            }
          >
            <Input
              type="text"
              {...register(fieldPath)}
              placeholder={field.placeholder}
            />
          </FormField>
        );
    }
  };

  return (
    <form id={id} onSubmit={handleSubmit(onSubmit)}>
      <div
        className={cn(
          'space-y-4',
          columns === 2 && 'grid grid-cols-2 gap-4 space-y-0'
        )}
      >
        {fields.map(renderField)}
      </div>
      {footer !== undefined ? (
        footer
      ) : (
        <div className="flex justify-end gap-2 mt-6">
          {onCancel && (
            <Button type="button" variant="outline" onClick={onCancel}>
              {cancelLabel}
            </Button>
          )}
          <Button type="submit" disabled={isPending} isLoading={isPending}>
            {submitLabel}
          </Button>
        </div>
      )}
    </form>
  );
}

export { SchemaForm };
export type { FieldConfig, SelectOption, FieldType };
