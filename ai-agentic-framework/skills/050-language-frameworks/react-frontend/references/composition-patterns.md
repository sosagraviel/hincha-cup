> **Load when:** Designing component APIs, building generic components, using TypeScript generics in React, or creating compound components.

# Composition Patterns

## Principle: Composition Over Configuration

Instead of components with many props (configuration), build components that accept `children` and slot-based composition.

**Configuration approach** (avoid at scale):
```tsx
// 15+ props, hard to maintain, impossible to extend
<Card
  title="Project Alpha"
  subtitle="Last updated 3 hours ago"
  icon={<FolderIcon />}
  status="active"
  statusColor="green"
  showBorder
  onClick={handleClick}
  actions={[{ label: 'Edit', onClick: handleEdit }]}
  footer={<span>2 members</span>}
/>
```

**Composition approach** (preferred):
```tsx
<Card onClick={handleClick}>
  <Card.Header>
    <FolderIcon />
    <Card.Title>Project Alpha</Card.Title>
    <Badge variant="success">Active</Badge>
  </Card.Header>
  <Card.Body>
    <p>Last updated 3 hours ago</p>
  </Card.Body>
  <Card.Footer>
    <span>2 members</span>
    <Button variant="ghost" onClick={handleEdit}>Edit</Button>
  </Card.Footer>
</Card>
```

## Compound Components

Split complex components into cooperating sub-components that share state via Context.

### Pattern

```tsx
// 1. Create context for shared state
interface AccordionContextType {
  openItems: Set<string>;
  toggle: (id: string) => void;
}
const AccordionContext = createContext<AccordionContextType | null>(null);

// 2. Main component provides context
function Accordion({ children, className }: AccordionProps) {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  const toggle = (id: string) => {
    setOpenItems(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <AccordionContext.Provider value={{ openItems, toggle }}>
      <div className={className}>{children}</div>
    </AccordionContext.Provider>
  );
}

// 3. Sub-components consume context
function Item({ id, children }: { id: string; children: React.ReactNode }) {
  const ctx = useContext(AccordionContext);
  if (!ctx) throw new Error('Accordion.Item must be used within Accordion');
  const isOpen = ctx.openItems.has(id);
  return (
    <div>
      <button onClick={() => ctx.toggle(id)}>{/* trigger */}</button>
      {isOpen && <div>{children}</div>}
    </div>
  );
}

// 4. Attach to parent
Accordion.Item = Item;

// 5. Usage
<Accordion>
  <Accordion.Item id="faq-1">
    <h3>Question 1</h3>
    <p>Answer 1</p>
  </Accordion.Item>
</Accordion>
```

### When to Use Compound Components

- The component has **3+ distinct visual sections** (header, body, footer, sidebar)
- The consumer needs to **control the layout** of sub-pieces
- Different use cases need **different combinations** of sub-components
- The internal state is **shared** between sub-components (open/close, selection)

### When NOT to Use

- Simple components with 1-3 props
- Components where the consumer never needs to customize internals
- When a `children` slot alone is sufficient

## Generic Components with TypeScript

Use generics to create type-safe reusable components:

```tsx
// Generic list component
interface DataListProps<T> {
  items: T[];
  renderItem: (item: T) => React.ReactNode;
  keyExtractor: (item: T) => string;
  emptyMessage?: string;
}

function DataList<T>({ items, renderItem, keyExtractor, emptyMessage }: DataListProps<T>) {
  if (items.length === 0) {
    return <EmptyState title={emptyMessage ?? 'No items'} />;
  }
  return (
    <ul>
      {items.map(item => (
        <li key={keyExtractor(item)}>{renderItem(item)}</li>
      ))}
    </ul>
  );
}

// Usage — T is inferred from items
<DataList
  items={users}
  keyExtractor={(u) => u.id}
  renderItem={(user) => <span>{user.name}</span>}
/>
```

### Generic Form Components

The `SchemaForm<TValues>` and `FormDialog<TValues>` use this pattern:

```tsx
// Use FieldValues from your form library as the constraint
function SchemaForm<TValues extends FieldValues>({
  schema,
  fields,
  onSubmit,
  defaultValues,
}: SchemaFormProps<TValues>) {
  const form = useForm<TValues>({
    resolver: schemaResolver(schema),
    defaultValues,
  });

  // Cast field names for the form library's path type
  const fieldPath = field.name as Path<TValues>;

  return <form onSubmit={form.handleSubmit(onSubmit)}>{/* ... */}</form>;
}
```

**Key TypeScript insight**: Use `TValues extends FieldValues` (a generic record type) instead of `T extends SchemaType<...>`. Schema libraries often create input/output type mismatches that break generic constraints with form library defaults. Using a simple record constraint avoids this entirely.

## Children vs Render Props

**Prefer `children`** for static composition:
```tsx
<CardGrid columns={{ sm: 1, md: 2, lg: 3 }}>
  {items.map(item => <ItemCard key={item.id} item={item} />)}
</CardGrid>
```

**Use render props** only when the parent needs to provide data back:
```tsx
<VirtualList
  items={largeDataSet}
  itemHeight={48}
  renderItem={(item, index, style) => (
    <div style={style}>{item.name}</div>
  )}
/>
```

## Controlled + Uncontrolled Pattern

Design components to work in both modes:

```tsx
interface ToggleProps {
  // Controlled mode (parent manages state)
  value?: boolean;
  onChange?: (value: boolean) => void;
  // Uncontrolled mode (internal state)
  defaultValue?: boolean;
}

function Toggle({ value: controlledValue, onChange, defaultValue = false }: ToggleProps) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const isControlled = controlledValue !== undefined;
  const currentValue = isControlled ? controlledValue : internalValue;

  const handleToggle = () => {
    const nextValue = !currentValue;
    if (!isControlled) setInternalValue(nextValue);
    onChange?.(nextValue);
  };

  return <button onClick={handleToggle}>{currentValue ? 'On' : 'Off'}</button>;
}
```

## Discriminated Unions for Props

When a component has mutually exclusive modes:

```tsx
// WRONG — allows impossible states
interface ButtonProps {
  isLoading?: boolean;
  isDisabled?: boolean;
  loadingText?: string;  // Only valid when isLoading
}

// RIGHT — each mode is explicit
type ButtonProps =
  | { state: 'idle'; onClick: () => void }
  | { state: 'loading'; loadingText: string }
  | { state: 'disabled'; reason: string };

function Button(props: ButtonProps) {
  switch (props.state) {
    case 'idle': return <button onClick={props.onClick}>Submit</button>;
    case 'loading': return <button disabled>{props.loadingText}</button>;
    case 'disabled': return <button disabled title={props.reason}>Submit</button>;
  }
}
```

## Slot Pattern

For organisms with named content areas:

```tsx
interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;  // Slot for action buttons
  breadcrumb?: React.ReactNode;
}

function PageHeader({ title, subtitle, actions, breadcrumb }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        {breadcrumb}
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-zinc-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

// Usage
<PageHeader
  title="Orders"
  subtitle="Manage and track all active orders"
  actions={
    <Button onClick={handleCreate}>
      <Plus className="size-4" /> New Order
    </Button>
  }
/>
```
