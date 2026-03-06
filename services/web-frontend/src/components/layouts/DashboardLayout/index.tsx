import { cn } from '@/shared/lib/utils';

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

export { DashboardLayout };
