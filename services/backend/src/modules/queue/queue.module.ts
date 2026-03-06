import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES, getDefaultQueueOptions } from './queues.config';
import { EntityEventProcessor } from './processors/entity-event.processor';
import { DeliveryProcessor } from './processors/delivery.processor';
import { PermissionEvaluatorService } from './services/permission-evaluator.service';
import { DeduplicationService } from './services/deduplication.service';
import { EntityEventEmitter } from './entity-event.emitter';
import { RedisModule } from '@modules/redis/redis.module';

/**
 * Configures BullMQ queues for the two-stage event pipeline: entity-events and delivery.
 * Exports EntityEventEmitter so domain modules can publish events.
 *
 * @example
 * @Module({ imports: [QueueModule] })
 * // Then inject EntityEventEmitter to emit events
 */
@Module({
  imports: [
    RedisModule,
    // Register entity-events queue (tickets, projects, orgs, chat)
    BullModule.registerQueue({
      name: QUEUE_NAMES.ENTITY_EVENTS,
      ...getDefaultQueueOptions()
    }),
    // Register delivery queue (WebSocket message delivery)
    BullModule.registerQueue({
      name: QUEUE_NAMES.DELIVERY,
      ...getDefaultQueueOptions()
    })
  ],
  providers: [
    EntityEventProcessor,
    DeliveryProcessor,
    PermissionEvaluatorService,
    DeduplicationService,
    EntityEventEmitter
  ],
  exports: [BullModule, EntityEventEmitter, DeliveryProcessor]
})
export class QueueModule {}
