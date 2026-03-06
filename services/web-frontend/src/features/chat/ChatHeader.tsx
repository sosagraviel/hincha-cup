import { Hash, Users } from 'lucide-react';

interface ChatHeaderProps {
  name: string;
  description?: string;
  type: 'room' | 'dm';
}

export function ChatHeader({ name, description, type }: ChatHeaderProps) {
  return (
    <div className="flex items-center gap-3 h-14 px-6 border-b border-zinc-200 bg-white shrink-0">
      {type === 'room' ? (
        <Hash className="size-5 text-zinc-400" />
      ) : (
        <Users className="size-5 text-zinc-400" />
      )}
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-zinc-900 truncate">{name}</h2>
        {description && (
          <p className="text-xs text-zinc-500 truncate">{description}</p>
        )}
      </div>
    </div>
  );
}
