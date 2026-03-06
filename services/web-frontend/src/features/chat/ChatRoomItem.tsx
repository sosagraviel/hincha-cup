import { cn } from '@/shared/lib/utils';
import { Hash } from 'lucide-react';
import type { ChatRoom } from '@/api/types';

interface ChatRoomItemProps {
  room: ChatRoom;
  isActive: boolean;
  onClick: () => void;
}

export function ChatRoomItem({ room, isActive, onClick }: ChatRoomItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left transition-colors',
        isActive ? 'bg-blue-50 text-blue-700' : 'text-zinc-700 hover:bg-zinc-50'
      )}
    >
      <Hash
        className={cn(
          'size-4 shrink-0',
          isActive ? 'text-blue-600' : 'text-zinc-400'
        )}
      />
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm truncate', isActive && 'font-medium')}>
          {room.name}
        </p>
        {room.description && (
          <p className="text-xs text-zinc-400 truncate">{room.description}</p>
        )}
      </div>
    </button>
  );
}
