import { EntityChangeType } from '@livonit/shared';

/**
 * Internal event payload emitted by services via EventEmitter2.
 * The gateway listens for these and broadcasts to the appropriate Socket.IO room.
 */
export interface InternalEntityChangePayload {
  /** Organization ID — determines which room receives the broadcast */
  orgId: string;
  /** Operation type */
  type: EntityChangeType;
  /** Entity/resource type (e.g. 'tickets', 'projects', 'organizations') */
  entity: string;
  /** Specific entity ID */
  id: string;
  /** Full or partial entity data (optional) */
  data?: Record<string, unknown>;
  /** Parent entity ID for nested invalidation (e.g. projectId for tickets) */
  parentId?: string;
  /** Parent entity type (e.g. 'projects' when entity is 'tickets') */
  parentEntity?: string;
}
