import { useEffect } from 'react';
import { useSocket } from '@/shared/context/socket/socket-context';

/**
 * Subscribe to a specific WebSocket channel while this component is mounted
 *
 * ## Available Channels
 *
 * ### Auto-subscribed (on connection):
 * - `user:{userId}` - Personal updates
 * - `user:{userId}:tickets:assigned` - My assigned tickets only
 *
 * ### Manual subscription (use this hook):
 * - `org:{orgId}` - Organization updates
 * - `project:{projectId}` - Project updates
 * - `project:{projectId}:tickets` - Project ticket updates (auto-joined with project)
 *
 * ## Examples
 *
 * ```tsx
 * // Subscribe to org updates while on org page
 * useChannelSubscription('org', orgId);
 *
 * // Subscribe to project updates while on board
 * useChannelSubscription('project', projectId);
 * ```
 *
 * @param channelType - Type of channel ('org' or 'project')
 * @param id - Organization or project ID
 */
export function useChannelSubscription(
  channelType: 'org' | 'project',
  id: string | undefined
): void {
  const { socket } = useSocket();

  useEffect(() => {
    if (!socket || !id) return;

    // Join channel on mount
    const joinEvent = `join_${channelType}`;
    const leaveEvent = `leave_${channelType}`;
    const payload = channelType === 'org' ? { orgId: id } : { projectId: id };

    socket.emit(joinEvent, payload);
    console.log(`[WebSocket] Joined ${channelType}:${id}`);

    // Leave channel on unmount
    return () => {
      socket.emit(leaveEvent, payload);
      console.log(`[WebSocket] Left ${channelType}:${id}`);
    };
  }, [socket, channelType, id]);
}
