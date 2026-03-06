import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@modules/redis/redis.service';

/**
 * Handles message deduplication using Redis Sets.
 * Prevents users from receiving duplicate notifications after reconnections.
 *
 * @example
 * constructor(private readonly dedup: DeduplicationService) {}
 * if (await this.dedup.isDelivered(userId, messageId)) return;
 */
@Injectable()
export class DeduplicationService {
  private readonly logger = new Logger(DeduplicationService.name);
  private readonly TTL_SECONDS = 86400; // 24 hours

  constructor(private readonly redisService: RedisService) {}

  /**
   * Check if a message has already been delivered to a user
   */
  async isDelivered(userId: string, messageId: string): Promise<boolean> {
    const key = this.getKey(userId);
    return this.redisService.sismember(key, messageId);
  }

  /**
   * Mark a message as delivered to a user
   */
  async markAsDelivered(userId: string, messageId: string): Promise<void> {
    const key = this.getKey(userId);

    // Add message ID to the set
    await this.redisService.sadd(key, messageId);

    // Set/refresh TTL
    await this.redisService.expire(key, this.TTL_SECONDS);

    this.logger.debug(
      `Marked message ${messageId} as delivered for user ${userId}`
    );
  }

  /**
   * Mark multiple messages as delivered to a user (batch operation)
   */
  async markMultipleAsDelivered(
    userId: string,
    messageIds: string[]
  ): Promise<void> {
    if (messageIds.length === 0) return;

    const key = this.getKey(userId);

    // Add all message IDs to the set
    await this.redisService.sadd(key, ...messageIds);

    // Set/refresh TTL
    await this.redisService.expire(key, this.TTL_SECONDS);

    this.logger.debug(
      `Marked ${messageIds.length} messages as delivered for user ${userId}`
    );
  }

  private getKey(userId: string): string {
    return `msg:delivered:${userId}`;
  }
}
