import { QueueOptions } from 'bullmq';

/**
 * Queue names used throughout the application
 */
export const QUEUE_NAMES = {
  ENTITY_EVENTS: 'entity-events',
  DELIVERY: 'delivery'
} as const;

/**
 * Base Redis connection configuration for BullMQ
 */
export const getRedisConnection = () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null // Required for BullMQ
});

/**
 * Default queue options
 */
export const getDefaultQueueOptions = (): QueueOptions => ({
  connection: getRedisConnection(),
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    removeOnComplete: {
      age: 3600 // Keep completed jobs for 1 hour
    },
    removeOnFail: {
      age: 86400 // Keep failed jobs for 24 hours
    }
  }
});
