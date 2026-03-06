import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocket } from '@/shared/context/socket/socket-context';
import { EntityChangeType } from '@/shared/types/entity-change-type.enum';

/** Mirrors packages/shared/src/dtos/websocket/index.ts */
interface EntityChangeMessage {
  messageId: string;
  type: EntityChangeType;
  entity: string;
  id: string;
  data?: Record<string, unknown>;
  timestamp: string;
  parentId?: string;
  parentEntity?: string;
}

function handleEntityChange(
  cache: ReturnType<typeof useQueryClient>,
  message: EntityChangeMessage
) {
  switch (message.type) {
    case EntityChangeType.ENTITY_CREATED:
      // For creates: invalidate list queries (ordering unknown)
      cache.invalidateQueries({
        queryKey: [message.entity],
        exact: false,
        refetchType: 'active'
      });
      // Also invalidate parent queries (e.g., board when ticket created)
      if (message.parentId && message.parentEntity) {
        cache.invalidateQueries({
          queryKey: [message.parentEntity, message.parentId],
          exact: false,
          refetchType: 'active'
        });
      }
      break;

    case EntityChangeType.ENTITY_UPDATED:
      // Direct update for detail queries (instant feedback)
      if (message.data) {
        cache.setQueryData([message.entity, message.id], (old: unknown) =>
          old && typeof old === 'object'
            ? { ...old, ...message.data }
            : message.data
        );
      }
      // Invalidate list queries (ordering/filtering may have changed)
      cache.invalidateQueries({
        queryKey: [message.entity],
        exact: false,
        refetchType: 'active'
      });
      // Also invalidate parent queries
      if (message.parentId && message.parentEntity) {
        cache.invalidateQueries({
          queryKey: [message.parentEntity, message.parentId],
          exact: false,
          refetchType: 'active'
        });
      }
      break;

    case EntityChangeType.ENTITY_DELETED:
      // Remove from detail cache
      cache.removeQueries({ queryKey: [message.entity, message.id] });
      // Invalidate list queries
      cache.invalidateQueries({
        queryKey: [message.entity],
        exact: false,
        refetchType: 'active'
      });
      // Also invalidate parent queries
      if (message.parentId && message.parentEntity) {
        cache.invalidateQueries({
          queryKey: [message.parentEntity, message.parentId],
          exact: false,
          refetchType: 'active'
        });
      }
      break;
  }
}

/**
 * Global WebSocket subscription hook.
 * Mount once at root layout. Handles:
 * - Direct cache updates from WebSocket messages (normal operation)
 * - Full refetch on recovery events (disconnect/reconnect, visibility change, network reconnection)
 *
 * ## Fine-Grained Channel Subscriptions (Phase 3)
 *
 * Users are automatically subscribed to these channels on connection:
 * - `user:{userId}` - Personal channel for all user-specific updates
 * - `user:{userId}:tickets:assigned` - Only tickets assigned to this user
 *
 * Additional channels can be joined/left dynamically:
 * - `org:{orgId}` - All organization updates (joined via join_org event)
 * - `project:{projectId}` - Project updates (joined via join_project event)
 * - `project:{projectId}:tickets` - Project ticket updates (auto-joined with project)
 *
 * The backend PermissionEvaluatorService determines which channels receive which events
 * based on database relationships (project membership, ticket assignment, etc.).
 */
export function useWebSocketSubscription() {
  const { socket, isConnected } = useSocket();
  const cache = useQueryClient();
  const lastDisconnectTime = useRef<number>(0);

  // Refetch everything after extended disconnection
  useEffect(() => {
    if (!socket) return;

    const handleDisconnect = () => {
      lastDisconnectTime.current = Date.now();
    };

    const handleReconnect = () => {
      const disconnectDuration = Date.now() - lastDisconnectTime.current;

      // Disconnected > 30 seconds: refetch all active queries
      if (disconnectDuration > 30 * 1000) {
        console.log(
          '[WebSocket] Reconnected after long disconnect, refetching all active queries'
        );
        cache.invalidateQueries({ refetchType: 'active' });
      }
    };

    socket.on('disconnect', handleDisconnect);
    socket.on('connect', handleReconnect);

    return () => {
      socket.off('disconnect', handleDisconnect);
      socket.off('connect', handleReconnect);
    };
  }, [socket, cache]);

  // Refetch on browser wake from sleep
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isConnected) {
        // Tab became visible — refetch to catch any missed updates
        console.log('[WebSocket] Tab visible, refetching active queries');
        cache.invalidateQueries({ refetchType: 'active' });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [cache, isConnected]);

  // Refetch on network reconnection
  useEffect(() => {
    const handleOnline = () => {
      if (isConnected) {
        console.log('[WebSocket] Network online, refetching active queries');
        cache.invalidateQueries({ refetchType: 'active' });
      }
    };

    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('online', handleOnline);
    };
  }, [cache, isConnected]);

  // Handle WebSocket messages (NORMAL OPERATION — NO REFETCH)
  useEffect(() => {
    if (!socket) return;

    const handleEntityChangeMessage = (message: EntityChangeMessage) => {
      console.log(
        '[WebSocket] Entity change:',
        message.type,
        message.entity,
        message.id
      );
      handleEntityChange(cache, message);
    };

    socket.on('entity_change', handleEntityChangeMessage);

    return () => {
      socket.off('entity_change', handleEntityChangeMessage);
    };
  }, [socket, cache]);
}
