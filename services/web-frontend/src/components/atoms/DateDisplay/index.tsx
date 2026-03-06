import { Calendar } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { formatDateAsDateAndTime } from '@/shared/lib/utils';

interface DateDisplayProps {
  date: string;
  className?: string;
}

function DateDisplay({ date, className }: DateDisplayProps) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 text-sm text-zinc-700',
        className
      )}
    >
      <Calendar className="size-3.5 text-zinc-400" />
      <span>{formatDateAsDateAndTime(date)}</span>
    </div>
  );
}

export { DateDisplay };
