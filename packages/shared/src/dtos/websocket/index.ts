import { EntityChangeType } from '../../enums/entity-change-type.enum';

export type { EntityChangeType };

export interface EntityChangeMessage {
  /** Unique message ID for deduplication after reconnection */
  messageId: string;
  /** Operation type */
  type: EntityChangeType;
  /** Entity/resource type — maps to query key prefix (e.g. 'tickets', 'projects') */
  entity: string;
  /** Specific entity ID */
  id: string;
  /** Full or partial entity data (optional — omit for lightweight invalidation) */
  data?: Record<string, unknown>;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Parent entity context for nested invalidation (e.g. projectId for tickets) */
  parentId?: string;
  /** Parent entity type (e.g. 'projects' when entity is 'tickets') */
  parentEntity?: string;
}
