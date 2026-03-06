import { useEffect } from 'react';
import { useSocket } from '@/shared/context/socket/socket-context';

/**
 * Subscribe to organization-specific WebSocket room.
 * Use this hook in the org layout route to receive real-time updates for the current organization.
 */
export function useOrgSubscription(orgId: string) {
  const { socket, isConnected } = useSocket();

  useEffect(() => {
    if (!socket || !isConnected || !orgId) return;

    console.log('[WebSocket] Joining org room:', orgId);
    socket.emit('join_org', { orgId });

    return () => {
      console.log('[WebSocket] Leaving org room:', orgId);
      socket.emit('leave_org', { orgId });
    };
  }, [socket, isConnected, orgId]);
}
