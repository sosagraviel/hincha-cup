import { useState, useRef, type KeyboardEvent } from 'react';
import { Send } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

interface ChatMessageInputProps {
  onSend: (content: string) => void;
  onTyping?: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export function ChatMessageInput({
  onSend,
  onTyping,
  disabled,
  placeholder = 'Type a message...'
}: ChatMessageInputProps) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleChange = (text: string) => {
    setValue(text);
    onTyping?.(text);
  };

  return (
    <div className="flex items-end gap-2 p-4 border-t border-zinc-200 bg-white">
      <textarea
        ref={inputRef}
        value={value}
        onChange={e => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className={cn(
          'flex-1 resize-none rounded-lg border border-zinc-200 px-3 py-2 text-sm',
          'placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent',
          'max-h-32 min-h-[38px]',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      />
      <button
        onClick={handleSend}
        disabled={disabled || !value.trim()}
        className={cn(
          'flex items-center justify-center rounded-lg size-[38px] shrink-0 transition-colors',
          value.trim()
            ? 'bg-blue-600 text-white hover:bg-blue-700'
            : 'bg-zinc-100 text-zinc-400 cursor-not-allowed'
        )}
      >
        <Send className="size-4" />
      </button>
    </div>
  );
}
