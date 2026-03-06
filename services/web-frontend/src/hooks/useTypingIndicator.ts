import { useEffect, useCallback, useState, useRef } from 'react';
import { useSocket } from '@/shared/context/socket/socket-context';

export interface TypingStatus {
  userId: string;
  context: 'room' | 'group' | 'dm';
  contextId: string;
  typing: boolean;
}

/**
 * Hook for handling typing indicators in chat
 *
 * @example
 * ```tsx
 * function ChatInput({ roomId }) {
 *   const { startTyping, stopTyping, typingUsers } = useTypingIndicator('room', roomId);
 *
 *   return (
 *     <div>
 *       <input
 *         onChange={(e) => {
 *           if (e.target.value) {
 *             startTyping();
 *           } else {
 *             stopTyping();
 *           }
 *         }}
 *       />
 *       {typingUsers.length > 0 && (
 *         <div>{typingUsers.length} user(s) typing...</div>
 *       )}
 *     </div>
 *   );
 * }
 * ```
 */
export function useTypingIndicator(
  context: 'room' | 'group' | 'dm',
  contextId: string
) {
  const { socket } = useSocket();
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isTypingRef = useRef(false);

  /**
   * Stop typing indicator
   */
  const stopTyping = useCallback(() => {
    if (!socket || !isTypingRef.current) return;

    socket.emit('typing_stop', { context, contextId });
    isTypingRef.current = false;

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = null;
    }
  }, [socket, context, contextId]);

  /**
   * Start typing indicator
   * Automatically stops after 3 seconds of inactivity
   */
  const startTyping = useCallback(() => {
    if (!socket || isTypingRef.current) return;

    socket.emit('typing_start', { context, contextId });
    isTypingRef.current = true;

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Auto-stop after 3 seconds
    typingTimeoutRef.current = setTimeout(() => {
      stopTyping();
    }, 3000);
  }, [socket, context, contextId, stopTyping]);

  /**
   * Handle input changes with debounced typing indicator
   * Call this in onChange handler of your input
   */
  const handleInputChange = useCallback(
    (value: string) => {
      if (value.trim()) {
        startTyping();
      } else {
        stopTyping();
      }
    },
    [startTyping, stopTyping]
  );

  // Listen for typing events from other users
  useEffect(() => {
    if (!socket) return;

    const handler = (status: TypingStatus) => {
      // Only update if it's for the current context
      if (status.context !== context || status.contextId !== contextId) return;

      setTypingUsers(prev => {
        if (status.typing) {
          // Add user to typing list
          return prev.includes(status.userId) ? prev : [...prev, status.userId];
        } else {
          // Remove user from typing list
          return prev.filter(id => id !== status.userId);
        }
      });
    };

    socket.on('user_typing', handler);

    return () => {
      socket.off('user_typing', handler);
      stopTyping(); // Stop typing on unmount
    };
  }, [socket, context, contextId, stopTyping]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  return {
    startTyping,
    stopTyping,
    handleInputChange,
    typingUsers,
    isTyping: typingUsers.length > 0
  };
}

/**
 * Hook for displaying typing indicator text
 *
 * @example
 * ```tsx
 * function TypingIndicator({ typingUsers, users }) {
 *   const text = useTypingText(typingUsers, users);
 *   if (!text) return null;
 *   return <div className="typing-indicator">{text}</div>;
 * }
 * ```
 */
export function useTypingText(
  typingUserIds: string[],
  users: { id: string; name: string }[]
): string {
  if (typingUserIds.length === 0) return '';

  const typingNames = typingUserIds
    .map(id => users.find(u => u.id === id)?.name || 'Someone')
    .slice(0, 3); // Show max 3 names

  if (typingNames.length === 1) {
    return `${typingNames[0]} is typing...`;
  } else if (typingNames.length === 2) {
    return `${typingNames[0]} and ${typingNames[1]} are typing...`;
  } else if (typingNames.length === 3) {
    return `${typingNames[0]}, ${typingNames[1]}, and ${typingNames[2]} are typing...`;
  } else {
    return `${typingNames[0]}, ${typingNames[1]}, and ${typingUserIds.length - 2} others are typing...`;
  }
}
