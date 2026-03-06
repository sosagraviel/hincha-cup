import { Injectable, Logger } from '@nestjs/common';
import { EntityChangeMessage } from '@livonit/shared';
import { DataSource } from 'typeorm';

/**
 * Delivery target for a specific user
 */
export interface DeliveryTarget {
  userId: string;
  channels: string[]; // Channels to emit to (e.g., ['user:123', 'user:123:tickets:assigned'])
  payload: EntityChangeMessage;
}

/**
 * Evaluates permissions to determine which users should receive entity change events.
 * Queries DB membership tables to build per-user delivery targets with channel lists.
 *
 * @example
 * constructor(private readonly permEval: PermissionEvaluatorService) {}
 * const targets = await this.permEval.evaluatePermissions(entityChangeEvent);
 */
@Injectable()
export class PermissionEvaluatorService {
  private readonly logger = new Logger(PermissionEvaluatorService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Determine which users should receive this entity change event
   * This implements the "queue time" permission check
   */
  async evaluatePermissions(
    event: EntityChangeMessage
  ): Promise<DeliveryTarget[]> {
    const { entity } = event;

    switch (entity) {
      case 'tickets':
        return this.evaluateTicketPermissions(event);
      case 'projects':
        return this.evaluateProjectPermissions(event);
      case 'organizations':
        return this.evaluateOrganizationPermissions(event);
      case 'chat':
        return this.evaluateChatPermissions(event);
      default:
        this.logger.warn(`Unknown entity type: ${entity}`);
        return [];
    }
  }

  /**
   * Evaluate ticket permissions - who should see ticket updates?
   * - Assignee
   * - Reporter
   * - Project members
   */
  private async evaluateTicketPermissions(
    event: EntityChangeMessage
  ): Promise<DeliveryTarget[]> {
    const ticketId = event.id;

    // Query: Find all users who should see this ticket
    const query = `
      SELECT DISTINCT
        u.id AS user_id,
        t.assignee_id,
        t.reporter_id,
        p.id AS project_id,
        o.id AS organization_id
      FROM tickets t
      JOIN projects p ON t.project_id = p.id
      JOIN organizations o ON p.organization_id = o.id
      JOIN project_members pm ON p.id = pm.project_id
      JOIN users u ON pm.user_id = u.id
      WHERE t.id = $1
      AND u.status = 'active'
    `;

    const results = await this.dataSource.query(query, [ticketId]);

    const targets: DeliveryTarget[] = results.map((row: any) => {
      const channels: string[] = [
        `user:${row.user_id}`, // Personal channel
        `project:${row.project_id}:tickets` // Project ticket updates channel
      ];

      // Add assigned channel if user is the assignee
      if (row.assignee_id === row.user_id) {
        channels.push(`user:${row.user_id}:tickets:assigned`);
      }

      return {
        userId: row.user_id,
        channels,
        payload: event
      };
    });

    return targets;
  }

  /**
   * Evaluate project permissions - who should see project updates?
   * - Project members
   */
  private async evaluateProjectPermissions(
    event: EntityChangeMessage
  ): Promise<DeliveryTarget[]> {
    const projectId = event.id;

    const query = `
      SELECT DISTINCT
        u.id AS user_id,
        p.id AS project_id,
        p.organization_id
      FROM projects p
      JOIN project_members pm ON p.id = pm.project_id
      JOIN users u ON pm.user_id = u.id
      WHERE p.id = $1
      AND u.status = 'active'
    `;

    const results = await this.dataSource.query(query, [projectId]);

    return results.map((row: any) => ({
      userId: row.user_id,
      channels: [
        `user:${row.user_id}`,
        `org:${row.organization_id}`,
        `project:${row.project_id}`
      ],
      payload: event
    }));
  }

  /**
   * Evaluate organization permissions - who should see org updates?
   * - Organization members
   */
  private async evaluateOrganizationPermissions(
    event: EntityChangeMessage
  ): Promise<DeliveryTarget[]> {
    const orgId = event.id;

    const query = `
      SELECT DISTINCT
        u.id AS user_id,
        o.id AS organization_id
      FROM organizations o
      JOIN organization_members om ON o.id = om.organization_id
      JOIN users u ON om.user_id = u.id
      WHERE o.id = $1
      AND u.status = 'active'
    `;

    const results = await this.dataSource.query(query, [orgId]);

    return results.map((row: any) => ({
      userId: row.user_id,
      channels: [`user:${row.user_id}`, `org:${row.organization_id}`],
      payload: event
    }));
  }

  /**
   * Evaluate chat permissions - who should see chat messages?
   * - Room members (if room)
   * - Group members (if group)
   * - DM participants (if DM)
   */
  private async evaluateChatPermissions(
    event: EntityChangeMessage
  ): Promise<DeliveryTarget[]> {
    const messageId = event.id;

    // Query message to determine context (room, group, or DM)
    const message = await this.dataSource.query(
      `
      SELECT
        room_id,
        group_id,
        dm_thread_id,
        sender_id
      FROM chat_messages
      WHERE id = $1
    `,
      [messageId]
    );

    if (!message || message.length === 0) {
      return [];
    }

    const msg = message[0];

    // Route to appropriate handler based on context
    if (msg.room_id) {
      return this.evaluateChatRoomPermissions(msg.room_id, event);
    } else if (msg.group_id) {
      return this.evaluateChatGroupPermissions(msg.group_id, event);
    } else if (msg.dm_thread_id) {
      return this.evaluateChatDmPermissions(msg.dm_thread_id, event);
    }

    return [];
  }

  /**
   * Evaluate chat room permissions - all org members can see public rooms
   */
  private async evaluateChatRoomPermissions(
    roomId: string,
    event: EntityChangeMessage
  ): Promise<DeliveryTarget[]> {
    const query = `
      SELECT DISTINCT
        u.id AS user_id,
        r.id AS room_id,
        r.organization_id
      FROM chat_rooms r
      JOIN organization_members om ON r.organization_id = om.organization_id
      JOIN users u ON om.user_id = u.id
      WHERE r.id = $1
      AND u.status = 'active'
      AND (r.is_public = true OR EXISTS (
        -- TODO: Add room membership table for private rooms
        SELECT 1 FROM chat_messages WHERE room_id = r.id AND sender_id = u.id
      ))
    `;

    const results = await this.dataSource.query(query, [roomId]);

    return results.map((row: any) => ({
      userId: row.user_id,
      channels: [
        `user:${row.user_id}`,
        `chat:room:${row.room_id}`,
        `org:${row.organization_id}`
      ],
      payload: event
    }));
  }

  /**
   * Evaluate chat group permissions - only group members
   */
  private async evaluateChatGroupPermissions(
    groupId: string,
    event: EntityChangeMessage
  ): Promise<DeliveryTarget[]> {
    const query = `
      SELECT DISTINCT
        u.id AS user_id,
        g.id AS group_id
      FROM chat_groups g
      JOIN chat_group_members gm ON g.id = gm.group_id
      JOIN users u ON gm.user_id = u.id
      WHERE g.id = $1
      AND u.status = 'active'
    `;

    const results = await this.dataSource.query(query, [groupId]);

    return results.map((row: any) => ({
      userId: row.user_id,
      channels: [`user:${row.user_id}`, `chat:group:${row.group_id}`],
      payload: event
    }));
  }

  /**
   * Evaluate DM permissions - only the two participants
   */
  private async evaluateChatDmPermissions(
    dmThreadId: string,
    event: EntityChangeMessage
  ): Promise<DeliveryTarget[]> {
    const query = `
      SELECT
        user1_id,
        user2_id
      FROM dm_threads
      WHERE id = $1
    `;

    const results = await this.dataSource.query(query, [dmThreadId]);

    if (!results || results.length === 0) {
      return [];
    }

    const thread = results[0];
    const dmChannel = `chat:dm:${dmThreadId}`;

    return [
      {
        userId: thread.user1_id,
        channels: [`user:${thread.user1_id}`, dmChannel],
        payload: event
      },
      {
        userId: thread.user2_id,
        channels: [`user:${thread.user2_id}`, dmChannel],
        payload: event
      }
    ];
  }
}
