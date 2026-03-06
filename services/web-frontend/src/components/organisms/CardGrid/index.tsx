import { cn } from '@/shared/lib/utils';

type Columns = 1 | 2 | 3 | 4;

interface ResponsiveColumns {
  sm?: Columns;
  md?: Columns;
  lg?: Columns;
}

interface CardGridProps {
  columns?: Columns | ResponsiveColumns;
  gap?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
  className?: string;
}

const gapMap = {
  sm: 'gap-3',
  md: 'gap-5',
  lg: 'gap-8'
} as const;

const colsMap = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4'
} as const;

function getColumnClasses(columns: Columns | ResponsiveColumns): string {
  if (typeof columns === 'number') {
    return colsMap[columns];
  }

  const classes: string[] = [];
  if (columns.sm) classes.push(colsMap[columns.sm]);
  if (columns.md) classes.push(`md:${colsMap[columns.md]}`);
  if (columns.lg) classes.push(`lg:${colsMap[columns.lg]}`);

  return classes.join(' ');
}

function CardGrid({
  columns = { sm: 1, md: 2, lg: 3 },
  gap = 'md',
  children,
  className
}: CardGridProps) {
  return (
    <div
      className={cn('grid', getColumnClasses(columns), gapMap[gap], className)}
    >
      {children}
    </div>
  );
}

export { CardGrid };
export type { CardGridProps, ResponsiveColumns };
