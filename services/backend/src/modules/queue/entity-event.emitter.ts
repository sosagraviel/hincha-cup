import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { EntityChangeType, EntityChangeMessage } from '@livonit/shared';
import { QUEUE_NAMES } from './queues.config';

/**
 * Emits entity change events to the BullMQ queue for real-time delivery via WebSocket.
 *
 * Centralizes the boilerplate of building an `EntityChangeMessage` and enqueuing it.
 * Every service that mutates an entity should use this instead of manually constructing
 * queue messages.
 *
 * @example
 * // In a service constructor:
 * constructor(private readonly events: EntityEventEmitter) {}
 *
 * // After creating/updating/deleting an entity:
 * await this.events.emit({
 *   type: EntityChangeType.ENTITY_CREATED,
 *   entity: 'tickets',
 *   id: ticket.id,
 *   data: ticket,
 *   parentId: projectId,
 *   parentEntity: 'projects',
 * });
 */
@Injectable()
export class EntityEventEmitter {
  constructor(
    @InjectQueue(QUEUE_NAMES.ENTITY_EVENTS)
    private readonly queue: Queue
  ) {}

  /**
   * Emit an entity change event to the processing queue.
   *
   * The queue processor will evaluate permissions and deliver the event
   * to the appropriate users via WebSocket.
   */
  async emit(params: {
    type: EntityChangeType;
    entity: string;
    id: string;
    data?: Record<string, unknown>;
    parentId?: string;
    parentEntity?: string;
  }): Promise<void> {
    const message: EntityChangeMessage = {
      messageId: randomUUID(),
      timestamp: new Date().toISOString(),
      ...params
    };
    await this.queue.add('process', message);
  }
}
