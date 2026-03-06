import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle
} from '@/shared/ui/sheet';
import { GenericLoader } from '@/shared/ui/generic-loader';
import { cn } from '@/shared/lib/utils';

/* ---------- Root ---------- */

interface DetailPanelProps {
  open: boolean;
  onClose: () => void;
  isLoading?: boolean;
  children: React.ReactNode;
  className?: string;
}

function DetailPanel({
  open,
  onClose,
  isLoading,
  children,
  className
}: DetailPanelProps) {
  return (
    <Sheet open={open} onOpenChange={() => onClose()}>
      <SheetContent
        className={cn('w-full sm:max-w-lg overflow-y-auto', className)}
      >
        {isLoading ? <GenericLoader /> : children}
      </SheetContent>
    </Sheet>
  );
}

/* ---------- Header ---------- */

interface DetailPanelHeaderProps {
  children: React.ReactNode;
  className?: string;
}

function Header({ children, className }: DetailPanelHeaderProps) {
  return (
    <SheetHeader className={className}>
      <div className="flex items-center gap-2 mb-1">{children}</div>
    </SheetHeader>
  );
}

/* ---------- Title ---------- */

interface DetailPanelTitleProps {
  children: React.ReactNode;
  className?: string;
}

function Title({ children, className }: DetailPanelTitleProps) {
  return (
    <SheetTitle
      className={cn('text-lg font-semibold text-zinc-900', className)}
    >
      {children}
    </SheetTitle>
  );
}

/* ---------- Section ---------- */

interface DetailPanelSectionProps {
  title?: string;
  children: React.ReactNode;
  className?: string;
}

function Section({ title, children, className }: DetailPanelSectionProps) {
  return (
    <div className={cn('mt-6', className)}>
      {title && (
        <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">
          {title}
        </h4>
      )}
      {children}
    </div>
  );
}

/* ---------- Grid ---------- */

interface DetailPanelGridProps {
  children: React.ReactNode;
  className?: string;
}

function Grid({ children, className }: DetailPanelGridProps) {
  return (
    <div className={cn('grid grid-cols-2 gap-4 mt-6', className)}>
      {children}
    </div>
  );
}

/* ---------- Field ---------- */

interface DetailPanelFieldProps {
  label: string;
  children: React.ReactNode;
  className?: string;
}

function Field({ label, children, className }: DetailPanelFieldProps) {
  return (
    <div className={className}>
      <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/* ---------- Compound export ---------- */

DetailPanel.Header = Header;
DetailPanel.Title = Title;
DetailPanel.Section = Section;
DetailPanel.Grid = Grid;
DetailPanel.Field = Field;

export { DetailPanel };
