> **Load when:** Creating or reviewing components, deciding the correct atomic design layer, or refactoring domain logic out of reusable components.

# Component Architecture (Atomic Design)

## Layer Definitions

### Atoms — Primitive Building Blocks

The smallest possible reusable units. Each atom wraps a single UI concern.

**Rules**:
- Zero business logic, zero domain knowledge
- Accept primitive props (`string`, `number`, `boolean`, `ReactNode`)
- Use `className` prop for style customization
- Use variant-based styling (e.g., class-variance-authority or similar) for sizes, colors, states
- Wrap UI primitive libraries when adding project-specific defaults

**Examples**:

```tsx
// atoms/FormField/index.tsx — Label + input slot + error
interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}

function FormField({ label, error, required, children, className }: FormFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label>
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
```

```tsx
// atoms/Avatar/index.tsx — Size variants via variant utility
const avatarVariants = cva('relative flex shrink-0 overflow-hidden rounded-full', {
  variants: {
    size: {
      xs: 'size-5 text-[10px]',
      sm: 'size-6 text-xs',
      md: 'size-8 text-sm',
      lg: 'size-10 text-base',
      xl: 'size-12 text-lg'
    }
  },
  defaultVariants: { size: 'md' }
});
```

```tsx
// atoms/EmptyState/index.tsx — Generic placeholder
interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}
```

### Molecules — Atom Compositions

Combine atoms into focused, reusable units. Still NO business logic.

**Rules**:
- Compose atoms and UI primitives
- May have internal state for UI concerns (hover, focus, debounce)
- Accept generic type parameters when the molecule serves multiple domains
- No API calls, no domain types

**Examples**:

```tsx
// molecules/SearchInput/index.tsx
interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  debounceMs?: number;
}
```

```tsx
// molecules/SchemaForm/index.tsx — Generic form from validation schema
interface SchemaFormProps<TValues extends FieldValues> {
  schema: ValidationSchema<TValues>;
  fields: FieldConfig<TValues>[];
  onSubmit: (data: TValues) => void;
  defaultValues?: Partial<TValues>;
  isPending?: boolean;
  submitLabel?: string;
  onCancel?: () => void;
  columns?: 1 | 2;
  footer?: React.ReactNode;
  id?: string;
}
```

The `SchemaForm` molecule is the core form abstraction. It:
- Takes a validation schema + field config array
- Uses a form library with schema resolver internally
- Renders `FormField` atoms with appropriate input types (text, textarea, select, number, date)
- Displays validation errors per field automatically
- Uses controlled components for complex fields (select, date pickers), uncontrolled for simple inputs

### Organisms — Complex UI Sections

Larger compositions that form recognizable page sections. Still generic.

**Rules**:
- NO domain imports (no order types, no user types, no product types)
- Accept `children` for composition — the feature decides what goes inside
- May use compound component pattern (sub-components attached to main)
- Accept configuration via props (schema, fields, columns, etc.)

**Examples**:

```tsx
// organisms/BoardColumn/index.tsx — Generic column
interface BoardColumnProps {
  title: string;
  count?: number;
  dotColor?: string;
  children: React.ReactNode;  // Feature renders domain cards here
  className?: string;
}
```

```tsx
// organisms/CardGrid/index.tsx — Responsive grid
interface CardGridProps {
  columns?: Columns | ResponsiveColumns;  // { sm?: 1-4, md?: 1-4, lg?: 1-4 }
  gap?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  className?: string;
}
```

```tsx
// organisms/DetailPanel/index.tsx — Compound component
function DetailPanel({ open, onClose, isLoading, children }: DetailPanelProps) { ... }

// Sub-components for structured composition
DetailPanel.Header = function Header({ children }) { ... };
DetailPanel.Title = function Title({ children }) { ... };
DetailPanel.Section = function Section({ title, children }) { ... };
DetailPanel.Grid = function Grid({ children }) { ... };
DetailPanel.Field = function Field({ label, children }) { ... };
```

```tsx
// organisms/FormDialog/index.tsx — Dialog + SchemaForm
interface FormDialogProps<TValues extends FieldValues> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  schema: ValidationSchema<TValues>;
  fields: FieldConfig<TValues>[];
  onSubmit: (data: TValues) => void;
  defaultValues?: Partial<TValues>;
  isPending?: boolean;
  submitLabel?: string;
}
```

### Layouts — Page Shells

Wrap pages with consistent chrome (padding, background, scroll containers).

```tsx
// layouts/DashboardLayout/index.tsx
interface DashboardLayoutProps {
  children: React.ReactNode;
  className?: string;
}

function DashboardLayout({ children, className }: DashboardLayoutProps) {
  return (
    <main className={cn('flex-1 overflow-hidden bg-white', className)}>
      <div className="h-full">{children}</div>
    </main>
  );
}
```

### Features — Domain Compositions

Features **own all business logic**. They compose organisms with domain-specific data.

**Rules**:
- Import from any layer (atoms, molecules, organisms, shared, api, hooks)
- Own data-fetching hooks, state, mutations
- Export page components + any components needed by routes
- Never import from other features (compose at the route level)

**Pattern — Feature Page**:
```tsx
// features/orders/OrderBoardPage.tsx
function OrderBoardPage({ workspaceId }: { workspaceId: string }) {
  // Own all state
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Own all queries
  const { data: board, isLoading } = useBoardQuery(workspaceId);

  // Compose organisms with domain data
  return (
    <>
      <Toolbar onCreateClick={() => setCreateDialogOpen(true)} />
      <div className="flex gap-4">
        {board?.columns.map(col => (
          <OrderBoardColumn key={col.status} column={col} onItemClick={setSelectedOrderId} />
        ))}
      </div>
      <OrderDetailView orderId={selectedOrderId} onClose={() => setSelectedOrderId(null)} />
      <CreateOrderDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} workspaceId={workspaceId} />
    </>
  );
}
```

**Pattern — Feature Wrapper (organism → domain)**:
```tsx
// features/orders/OrderBoardColumn.tsx
function OrderBoardColumn({ column, onItemClick }) {
  return (
    <BoardColumn title={column.label} count={column.items.length} dotColor={statusColors[column.status]}>
      {column.items.map(order => (
        <OrderCard key={order.id} order={order} onClick={() => onItemClick(order.id)} />
      ))}
    </BoardColumn>
  );
}
```

## Compound Component Pattern

Use this when an organism has multiple "slots" that the consumer fills:

```tsx
// Define context for shared state
const PanelContext = createContext<{ onClose: () => void } | null>(null);

// Main component
function DetailPanel({ open, onClose, isLoading, children }: DetailPanelProps) {
  return (
    <SideSheet open={open} onOpenChange={(v) => !v && onClose()}>
      <PanelContext.Provider value={{ onClose }}>
        {isLoading ? <LoadingSpinner /> : children}
      </PanelContext.Provider>
    </SideSheet>
  );
}

// Attach sub-components
DetailPanel.Header = function Header({ children, className }) {
  return <div className={cn('flex items-center gap-2', className)}>{children}</div>;
};

DetailPanel.Section = function Section({ title, children, className }) {
  return (
    <div className={cn('mt-6', className)}>
      <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{title}</h4>
      <div className="mt-2">{children}</div>
    </div>
  );
};
```

## Styling Conventions

- Use utility-first CSS classes directly (e.g., Tailwind CSS)
- Use a class merging utility (e.g., `cn()` = clsx + tailwind-merge) for conditional/merged classes
- Use a variant utility (e.g., `cva`) for variant-based components (sizes, colors, states)
- Wrap UI primitive libraries as the base layer
- Never use inline `style={{}}` for static values — use utility classes
- Use CSS variables for dynamic values (themes, computed sizes)

## Prop Interface Conventions

```tsx
// Always named {Component}Props
interface CardGridProps { ... }

// Use ReactNode for render slots
children: React.ReactNode;

// Use callback naming: on{Event}
onClose: () => void;
onClick: (id: string) => void;
onOpenChange: (open: boolean) => void;

// Always include className for style extension
className?: string;

// Use discriminated unions for exclusive states
type ButtonVariant =
  | { variant: 'primary'; icon?: never }
  | { variant: 'icon'; icon: React.ReactNode };
```
