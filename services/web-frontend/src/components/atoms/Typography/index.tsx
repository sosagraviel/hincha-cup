import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/shared/lib/utils';

const headingVariants = cva('text-zinc-900 font-bold', {
  variants: {
    level: {
      1: 'text-4xl',
      2: 'text-3xl',
      3: 'text-2xl font-semibold',
      4: 'text-xl font-semibold',
      5: 'text-base font-semibold',
      6: 'text-sm font-semibold'
    }
  },
  defaultVariants: {
    level: 1
  }
});

type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

interface HeadingProps
  extends React.HTMLAttributes<HTMLHeadingElement>,
    VariantProps<typeof headingVariants> {
  level?: HeadingLevel;
}

function Heading({ level = 1, className, children, ...props }: HeadingProps) {
  const Tag = `h${level}` as const;
  return (
    <Tag className={cn(headingVariants({ level }), className)} {...props}>
      {children}
    </Tag>
  );
}

const textVariants = cva('', {
  variants: {
    variant: {
      body: 'text-sm text-zinc-700',
      caption: 'text-xs text-zinc-500',
      overline: 'text-[10px] uppercase tracking-wider text-zinc-500 font-medium'
    }
  },
  defaultVariants: {
    variant: 'body'
  }
});

interface TextProps
  extends React.HTMLAttributes<HTMLParagraphElement>,
    VariantProps<typeof textVariants> {
  as?: 'p' | 'span' | 'div';
}

function Text({
  variant = 'body',
  as: Tag = 'p',
  className,
  children,
  ...props
}: TextProps) {
  return (
    <Tag className={cn(textVariants({ variant }), className)} {...props}>
      {children}
    </Tag>
  );
}

export { Heading, Text };
