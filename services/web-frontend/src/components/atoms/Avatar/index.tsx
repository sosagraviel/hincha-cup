import { cn } from '@/shared/lib/utils';
import {
  Avatar as ShadcnAvatar,
  AvatarFallback,
  AvatarImage
} from '@/shared/ui/avatar';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const sizeClasses: Record<AvatarSize, string> = {
  xs: 'size-5',
  sm: 'size-6',
  md: 'size-8',
  lg: 'size-10',
  xl: 'size-12'
};

const fallbackTextSize: Record<AvatarSize, string> = {
  xs: 'text-[8px]',
  sm: 'text-[10px]',
  md: 'text-xs',
  lg: 'text-sm',
  xl: 'text-base'
};

interface AvatarProps {
  src?: string;
  alt?: string;
  fallback?: string;
  size?: AvatarSize;
  className?: string;
}

export function Avatar({
  src,
  alt,
  fallback,
  size = 'md',
  className
}: AvatarProps) {
  const initials =
    fallback ||
    (alt
      ? alt
          .split(' ')
          .map(n => n[0])
          .join('')
          .toUpperCase()
          .slice(0, 2)
      : '?');

  return (
    <ShadcnAvatar className={cn(sizeClasses[size], className)}>
      {src && <AvatarImage src={src} alt={alt} />}
      <AvatarFallback
        className={cn(
          'bg-zinc-100 text-zinc-600 font-medium',
          fallbackTextSize[size]
        )}
      >
        {initials}
      </AvatarFallback>
    </ShadcnAvatar>
  );
}
