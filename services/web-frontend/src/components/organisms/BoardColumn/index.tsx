import { cn } from '@/shared/lib/utils';

interface BoardColumnProps {
  title: string;
  count?: number;
  dotColor?: string;
  children: React.ReactNode;
  className?: string;
}

function BoardColumn({
  title,
  count,
  dotColor,
  children,
  className
}: BoardColumnProps) {
  return (
    <div
      className={cn(
        'flex flex-col bg-white rounded-lg border border-zinc-200 min-w-[260px] flex-1',
        className
      )}
    >
      <div className="flex items-center gap-2 px-3.5 h-11 border-b border-zinc-200">
        {dotColor && <span className={cn('size-2 rounded-full', dotColor)} />}
        <h3 className="text-[13px] font-semibold text-zinc-900">{title}</h3>
        {count !== undefined && (
          <span className="text-[11px] font-semibold text-zinc-500 bg-zinc-100 px-2 py-0.5 rounded-full">
            {count}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2">{children}</div>
    </div>
  );
}

export { BoardColumn };
