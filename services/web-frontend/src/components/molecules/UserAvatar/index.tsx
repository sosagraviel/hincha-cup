import { Avatar } from '@/components/atoms/Avatar';
import { cn } from '@/shared/lib/utils';

type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

interface UserAvatarProps {
  user: { fullName: string; profilePictureUrl?: string } | null | undefined;
  size?: AvatarSize;
  showName?: boolean;
  className?: string;
}

const nameTextSize: Record<AvatarSize, string> = {
  xs: 'text-xs',
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-sm',
  xl: 'text-base'
};

function UserAvatar({
  user,
  size = 'md',
  showName = true,
  className
}: UserAvatarProps) {
  if (!user) {
    return (
      <span className={cn('text-sm text-zinc-400', className)}>Unassigned</span>
    );
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Avatar src={user.profilePictureUrl} alt={user.fullName} size={size} />
      {showName && (
        <span className={cn('text-zinc-700', nameTextSize[size])}>
          {user.fullName}
        </span>
      )}
    </div>
  );
}

export { UserAvatar };
