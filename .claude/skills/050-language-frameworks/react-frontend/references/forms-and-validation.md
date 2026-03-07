> **Load when:** Building forms, debugging validation, creating schema-driven UIs, or working with form libraries and validation schemas.

# Forms & Validation

## The Schema-Driven Form Pattern

Every form in the application follows the same three-part pattern:

### 1. Validation Schema (source of truth for types + validation)

```tsx
// features/orders/schemas.ts
import { z } from 'zod';  // or yup, valibot, superstruct — any schema library

export const createOrderSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  priority: z.nativeEnum(Priority),
  status: z.nativeEnum(OrderStatus),
});

// ALWAYS infer types from schema — never define separately
export type CreateOrderFormValues = z.infer<typeof createOrderSchema>;
```

**Critical rule**: Do NOT use `.default()` on schema fields. Defaults create a type mismatch where the input type is `T | undefined` but the output type is `T`. This breaks generic type constraints. Use `defaultValues` on the form instead.

### 2. Field Config (drives SchemaForm rendering)

```tsx
// features/orders/field-configs.ts
import type { FieldConfig } from '@/components/molecules/SchemaForm';
import type { CreateOrderFormValues } from './schemas';

export const priorityOptions = [
  { label: 'Critical', value: Priority.CRITICAL },
  { label: 'High', value: Priority.HIGH },
  { label: 'Medium', value: Priority.MEDIUM },
  { label: 'Low', value: Priority.LOW },
];

export const statusOptions = [
  { label: 'Draft', value: OrderStatus.DRAFT },
  { label: 'Pending', value: OrderStatus.PENDING },
  { label: 'Processing', value: OrderStatus.PROCESSING },
  { label: 'Completed', value: OrderStatus.COMPLETED },
];

export const createOrderFields: FieldConfig<CreateOrderFormValues>[] = [
  { name: 'title', label: 'Title', type: 'text', placeholder: 'What needs to be done?' },
  { name: 'description', label: 'Description', type: 'textarea', placeholder: 'Add details...' },
  { name: 'priority', label: 'Priority', type: 'select', options: priorityOptions },
  { name: 'status', label: 'Status', type: 'select', options: statusOptions },
];
```

### 3. Feature Component (wires everything together)

```tsx
// features/orders/CreateOrderDialog.tsx
import { FormDialog } from '@/components/organisms/FormDialog';
import { useCreateOrderMutation } from '@/hooks/queries/orderQueries';
import { createOrderSchema, type CreateOrderFormValues } from './schemas';
import { createOrderFields } from './field-configs';

interface CreateOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
}

function CreateOrderDialog({ open, onOpenChange, workspaceId }: CreateOrderDialogProps) {
  const createOrder = useCreateOrderMutation(workspaceId);

  const handleSubmit = (data: CreateOrderFormValues) => {
    createOrder.mutate(data, { onSuccess: () => onOpenChange(false) });
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create New Order"
      schema={createOrderSchema}
      fields={createOrderFields}
      defaultValues={{ priority: Priority.MEDIUM, status: OrderStatus.DRAFT }}
      onSubmit={handleSubmit}
      isPending={createOrder.isPending}
      submitLabel="Create"
    />
  );
}
```

## SchemaForm Internals

The `SchemaForm<TValues>` molecule handles all form rendering:

```tsx
function SchemaForm<TValues extends FieldValues>({
  schema, fields, onSubmit, defaultValues, isPending, id, ...
}: SchemaFormProps<TValues>) {
  const { register, handleSubmit, control, formState: { errors } } = useForm<TValues>({
    resolver: schemaResolver(schema),  // zodResolver, yupResolver, etc.
    defaultValues,
  });

  const renderField = (field: FieldConfig<TValues>) => {
    const fieldPath = field.name as Path<TValues>;
    const error = errors[field.name]?.message as string | undefined;

    if (field.type === 'select') {
      return (
        <FormField label={field.label} error={error} required={/* from schema */}>
          <Controller
            control={control}
            name={fieldPath}
            render={({ field: formField }) => (
              <Select value={formField.value} onValueChange={formField.onChange}>
                {field.options?.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </Select>
            )}
          />
        </FormField>
      );
    }

    return (
      <FormField label={field.label} error={error}>
        <Input {...register(fieldPath)} placeholder={field.placeholder} />
      </FormField>
    );
  };

  return (
    <form id={id} onSubmit={handleSubmit(onSubmit)}>
      {fields.map(renderField)}
      {/* footer with cancel/submit buttons */}
    </form>
  );
}
```

**TypeScript generics**: Use `TValues extends FieldValues` (from the form library) instead of schema library generics for the generic parameter. This avoids type mismatches between schema input/output types and form library default value types.

## Supported Field Types

| Type | Input Component | Registration |
|------|----------------|-------------|
| `text` | `<Input>` | `register(fieldPath)` |
| `textarea` | `<Textarea>` | `register(fieldPath)` |
| `select` | `<Select>` | `<Controller>` (controlled) |
| `number` | `<Input type="number">` | `register(fieldPath, { valueAsNumber: true })` |
| `date` | `<Input type="date">` or date picker | `register(fieldPath)` or `<Controller>` |

## Cross-Field Validation

Use `.refine()` for simple cases:

```tsx
const schema = z.object({
  password: z.string().min(8),
  confirmPassword: z.string(),
}).refine(
  (data) => data.password === data.confirmPassword,
  { message: 'Passwords must match', path: ['confirmPassword'] }
);
```

Use `.superRefine()` for complex multi-field logic:

```tsx
const schema = z.object({
  startDate: z.string(),
  endDate: z.string(),
  priority: z.nativeEnum(Priority),
}).superRefine((data, ctx) => {
  if (new Date(data.endDate) <= new Date(data.startDate)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End date must be after start date',
      path: ['endDate'],
    });
  }
});
```

> **Note**: The examples above use Zod syntax. If using a different schema library (yup, valibot, superstruct), the API differs but the architectural pattern (schema → field config → feature wrapper) remains identical.

## Multi-Step Forms

For wizards, split schemas and compose:

```tsx
const step1Schema = z.object({ name: z.string(), email: z.string().email() });
const step2Schema = z.object({ role: z.nativeEnum(Role), department: z.string() });
const fullSchema = step1Schema.merge(step2Schema);

type FullFormValues = z.infer<typeof fullSchema>;

// Each step renders a SchemaForm with its own schema
// On final step, combine all step data and submit
```

## Edit Forms (Pre-populated)

Reuse the same schema with `defaultValues` from existing data:

```tsx
function EditOrderDialog({ order, open, onOpenChange }: EditOrderDialogProps) {
  const updateOrder = useUpdateOrderMutation(order.id, order.workspaceId);

  return (
    <FormDialog
      schema={updateOrderSchema}
      fields={updateOrderFields}
      defaultValues={{
        title: order.title,
        description: order.description ?? '',
        priority: order.priority,
      }}
      onSubmit={(data) => updateOrder.mutate(data, { onSuccess: () => onOpenChange(false) })}
      isPending={updateOrder.isPending}
      submitLabel="Save Changes"
    />
  );
}
```
