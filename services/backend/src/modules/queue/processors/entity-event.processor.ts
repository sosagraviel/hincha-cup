import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { EntityChangeMessage } from '@livonit/shared';
import { QUEUE_NAMES } from '../queues.config';
import { PermissionEvaluatorService } from '../services/permission-evaluator.service';

/**
 * BullMQ worker that processes entity change events (tickets, projects, orgs, chat).
 * Evaluates permissions and fans out delivery jobs to the delivery queue.
 *
 * @example
 * // Automatically consumed from the ENTITY_EVENTS queue:
 * // { entity: 'tickets', type: 'ENTITY_CREATED', id: '...', data: {...} }
 */
@Processor(QUEUE_NAMES.ENTITY_EVENTS)
@Injectable()
export class EntityEventProcessor extends WorkerHost {
  private readonly logger = new Logger(EntityEventProcessor.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.DELIVERY)
    private readonly deliveryQueue: Queue,
    private readonly permissionEvaluator: PermissionEvaluatorService
  ) {
    super();
  }

  async process(job: Job<EntityChangeMessage>): Promise<void> {
    const event = job.data;
    this.logger.debug(
      `Processing ${event.entity}:${event.type} for ${event.id}`
    );

    try {
      // Step 1: Evaluate permissions - who should receive this event?
      const deliveryTargets =
        await this.permissionEvaluator.evaluatePermissions(event);

      this.logger.debug(
        `Found ${deliveryTargets.length} delivery targets for ${event.entity}:${event.id}`
      );

      // Step 2: Create delivery jobs for each target user
      const deliveryJobs = deliveryTargets.map(target => ({
        name: 'deliver',
        data: target,
        opts: {
          jobId: `${event.messageId}:${target.userId}`, // Ensures uniqueness per user
          attempts: 1, // Don't retry delivery (if user offline, skip)
          removeOnComplete: { count: 100 }, // Keep last 100 completed
          removeOnFail: { count: 50 } // Keep last 50 failed
        }
      }));

      // Batch add delivery jobs
      if (deliveryJobs.length > 0) {
        await this.deliveryQueue.addBulk(deliveryJobs);
        this.logger.debug(
          `Created ${deliveryJobs.length} delivery jobs for ${event.messageId}`
        );
      }
    } catch (error) {
      this.logger.error(`Error processing event ${event.messageId}:`, error);
      throw error; // Will trigger job retry
    }
  }
}
