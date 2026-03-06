import { cn } from '@/shared/lib/utils';
import { Priority } from '@/api/types';

const priorityConfig: Record<Priority, { label: string; className: string }> = {
  [Priority.CRITICAL]: {
    label: 'Critical',
    className: 'bg-red-50 text-red-500'
  },
  [Priority.HIGH]: {
    label: 'High',
    className: 'bg-red-50 text-red-500'
  },
  [Priority.MEDIUM]: {
    label: 'Medium',
    className: 'bg-zinc-100 text-zinc-500'
  },
  [Priority.LOW]: {
    label: 'Low',
    className: 'bg-amber-50 text-amber-600'
  }
};

interface PriorityBadgeProps {
  priority: Priority;
  className?: string;
}

function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const config = priorityConfig[priority];
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 h-5 rounded text-[10px] font-semibold',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}

export { PriorityBadge };
