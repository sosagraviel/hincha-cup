import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES } from '../queues.config';
import { DeliveryTarget } from '../services/permission-evaluator.service';
import { DeduplicationService } from '../services/deduplication.service';
import { Server } from 'socket.io';

/**
 * BullMQ worker that delivers entity change events to connected WebSocket clients.
 * Checks deduplication, verifies user presence, and broadcasts to Socket.IO rooms.
 *
 * @example
 * // Requires the WebSocket server to be registered via setServer():
 * deliveryProcessor.setServer(socketIoServer);
 */
@Processor(QUEUE_NAMES.DELIVERY)
@Injectable()
export class DeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(DeliveryProcessor.name);
  private server: Server | null = null;

  constructor(private readonly deduplicationService: DeduplicationService) {
    super();
  }

  /**
   * Called by WebSocket gateway to provide Socket.IO server instance
   */
  setServer(server: Server): void {
    this.server = server;
    this.logger.log('WebSocket server registered with delivery processor');
  }

  async process(job: Job<DeliveryTarget>): Promise<void> {
    const target = job.data;

    if (!this.server) {
      this.logger.warn('WebSocket server not available - skipping delivery');
      return;
    }

    try {
      const { userId, channels, payload } = target;

      // Phase 6: Check if message already delivered (deduplication)
      const alreadyDelivered = await this.deduplicationService.isDelivered(
        userId,
        payload.messageId
      );

      if (alreadyDelivered) {
        this.logger.debug(
          `Message ${payload.messageId} already delivered to user ${userId} - skipping`
        );
        return;
      }

      // Check if user is connected (has any socket in their user room)
      const userRoom = `user:${userId}`;
      const socketsInRoom = await this.server.in(userRoom).fetchSockets();

      if (socketsInRoom.length === 0) {
        // User offline - skip delivery (message already in DB for chat)
        this.logger.debug(
          `User ${userId} offline - skipping delivery of ${payload.messageId}`
        );
        return;
      }

      // User is online - broadcast to all their channels
      for (const channel of channels) {
        this.server.to(channel).emit('entity_change', payload);
        this.logger.debug(
          `Delivered ${payload.entity}:${payload.type} to channel ${channel}`
        );
      }

      // Phase 6: Mark message as delivered to prevent duplicates
      await this.deduplicationService.markAsDelivered(
        userId,
        payload.messageId
      );
    } catch (error) {
      this.logger.error(`Error delivering message ${job.id}:`, error);
      // Don't throw - we don't want to retry delivery
    }
  }
}
