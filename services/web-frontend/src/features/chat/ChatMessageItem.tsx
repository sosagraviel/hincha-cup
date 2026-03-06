import { Avatar } from '@/components/atoms/Avatar';
import { cn } from '@/shared/lib/utils';
import { formatDateAsDateAndTime } from '@/shared/lib/utils';
import type { ChatMessage } from '@/api/types';
import { Trash2 } from 'lucide-react';

interface ChatMessageItemProps {
  message: ChatMessage;
  isOwn: boolean;
  onDelete?: (messageId: string) => void;
}

export function ChatMessageItem({
  message,
  isOwn,
  onDelete
}: ChatMessageItemProps) {
  const senderName = message.sender?.fullName ?? 'Unknown';

  return (
    <div
      className={cn('flex gap-3 px-4 py-2 group', isOwn && 'flex-row-reverse')}
      data-message-id={message.id}
    >
      <Avatar
        src={message.sender?.profilePictureUrl}
        alt={senderName}
        size="sm"
        className="mt-1 shrink-0"
      />
      <div className={cn('flex flex-col max-w-[70%]', isOwn && 'items-end')}>
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-medium text-zinc-700">
            {senderName}
          </span>
          <span className="text-[10px] text-zinc-400">
            {formatDateAsDateAndTime(message.createdAt)}
          </span>
        </div>
        <div
          className={cn(
            'rounded-lg px-3 py-2 text-sm leading-relaxed',
            isOwn ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-900'
          )}
        >
          {message.content}
        </div>
        {isOwn && onDelete && (
          <button
            onClick={() => onDelete(message.id)}
            className="hidden group-hover:flex items-center gap-1 mt-1 text-[10px] text-zinc-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="size-3" />
            Delete
          </button>
        )}
      </div>
    </div>
  );
}
