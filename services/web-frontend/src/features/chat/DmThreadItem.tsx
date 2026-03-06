import { Avatar } from '@/components/atoms/Avatar';
import { cn } from '@/shared/lib/utils';
import type { DmThread } from '@/api/types';

interface DmThreadItemProps {
  thread: DmThread;
  currentUserId: string;
  isActive: boolean;
  onClick: () => void;
}

export function DmThreadItem({
  thread,
  currentUserId,
  isActive,
  onClick
}: DmThreadItemProps) {
  const otherUser =
    thread.user1Id === currentUserId ? thread.user2 : thread.user1;
  const name = otherUser?.fullName ?? 'Unknown User';

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left transition-colors',
        isActive ? 'bg-blue-50 text-blue-700' : 'text-zinc-700 hover:bg-zinc-50'
      )}
    >
      <Avatar src={otherUser?.profilePictureUrl} alt={name} size="sm" />
      <p className={cn('text-sm truncate flex-1', isActive && 'font-medium')}>
        {name}
      </p>
    </button>
  );
}
