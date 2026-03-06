import { useEffect, useRef } from 'react';
import { ChatMessageItem } from './ChatMessageItem';
import { EmptyState } from '@/components/atoms/EmptyState';
import { GenericLoader } from '@/shared/ui/generic-loader';
import { MessageCircle } from 'lucide-react';
import type { ChatMessage } from '@/api/types';

interface ChatMessageListProps {
  messages: ChatMessage[];
  currentUserId: string;
  isLoading: boolean;
  onDeleteMessage?: (messageId: string) => void;
}

export function ChatMessageList({
  messages,
  currentUserId,
  isLoading,
  onDeleteMessage
}: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <GenericLoader />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <EmptyState
          icon={<MessageCircle className="size-10 text-zinc-300" />}
          title="No messages yet"
          description="Send the first message to start the conversation."
        />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto py-4">
      {messages.map(msg => (
        <ChatMessageItem
          key={msg.id}
          message={msg}
          isOwn={msg.senderId === currentUserId}
          onDelete={onDeleteMessage}
        />
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
