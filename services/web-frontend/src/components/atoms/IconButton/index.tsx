import { Button } from '@/shared/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/shared/ui/tooltip';
import { cn } from '@/shared/lib/utils';
import type { VariantProps } from 'class-variance-authority';
import type { buttonVariants } from '@/shared/ui/button';

interface IconButtonProps
  extends Omit<React.ComponentProps<'button'>, 'children'>,
    Pick<VariantProps<typeof buttonVariants>, 'variant'> {
  icon: React.ReactNode;
  tooltip?: string;
  size?: 'sm' | 'default' | 'lg';
}

const sizeMap = {
  sm: 'size-8',
  default: 'size-9',
  lg: 'size-10'
} as const;

function IconButton({
  icon,
  tooltip,
  variant = 'ghost',
  size = 'default',
  className,
  ...props
}: IconButtonProps) {
  const button = (
    <Button
      variant={variant}
      size="icon"
      className={cn(sizeMap[size], className)}
      {...props}
    >
      {icon}
    </Button>
  );

  if (!tooltip) return button;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export { IconButton };
