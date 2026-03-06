import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@modules/redis/redis.service';

/**
 * Represents a single user's typing state with automatic expiration.
 *
 * @example
 * // { userId: 'abc', expiresAt: 1708900005000 }
 */
export interface TypingIndicator {
  userId: string;
  userName?: string;
  expiresAt: number; // Unix timestamp (milliseconds)
}

/**
 * Manages typing indicators using Redis hashes with TTL
 * - Typing indicators expire after 5 seconds of inactivity
 * - Each room/group/DM has its own hash of currently typing users
 */
@Injectable()
export class TypingManager {
  private readonly logger = new Logger(TypingManager.name);
  private readonly TYPING_TTL = 10; // 10 seconds (hash expiry)
  private readonly TYPING_DURATION = 5000; // 5 seconds (indicator expiry)

  constructor(private readonly redisService: RedisService) {}

  /**
   * Mark user as typing in a specific context (room, group, or DM)
   */
  async setTyping(
    context: 'room' | 'group' | 'dm',
    contextId: string,
    userId: string
  ): Promise<void> {
    const key = this.getKey(context, contextId);
    const expiresAt = Date.now() + this.TYPING_DURATION;

    await this.redisService.hset(key, userId, expiresAt.toString());
    await this.redisService.expire(key, this.TYPING_TTL);

    this.logger.debug(`User ${userId} typing in ${context}:${contextId}`);
  }

  /**
   * Stop typing indicator for a user
   */
  async stopTyping(
    context: 'room' | 'group' | 'dm',
    contextId: string,
    userId: string
  ): Promise<void> {
    const key = this.getKey(context, contextId);
    await this.redisService.hdel(key, userId);

    this.logger.debug(
      `User ${userId} stopped typing in ${context}:${contextId}`
    );
  }

  /**
   * Get all currently typing users in a context
   * Filters out expired indicators
   */
  async getTypingUsers(
    context: 'room' | 'group' | 'dm',
    contextId: string
  ): Promise<string[]> {
    const key = this.getKey(context, contextId);
    const client = this.redisService.getClient();
    const typingData = await client.hgetall(key);

    if (!typingData || Object.keys(typingData).length === 0) {
      return [];
    }

    const now = Date.now();
    const activeUsers: string[] = [];
    const expiredUsers: string[] = [];

    for (const [userId, expiresAtStr] of Object.entries(typingData)) {
      const expiresAt = parseInt(expiresAtStr);

      if (expiresAt > now) {
        activeUsers.push(userId);
      } else {
        expiredUsers.push(userId);
      }
    }

    // Clean up expired entries
    if (expiredUsers.length > 0) {
      await this.redisService.hdel(key, ...expiredUsers);
      this.logger.debug(
        `Cleaned up ${expiredUsers.length} expired typing indicators in ${context}:${contextId}`
      );
    }

    return activeUsers;
  }

  /**
   * Check if a specific user is typing in a context
   */
  async isUserTyping(
    context: 'room' | 'group' | 'dm',
    contextId: string,
    userId: string
  ): Promise<boolean> {
    const key = this.getKey(context, contextId);
    const expiresAtStr = await this.redisService.hget(key, userId);

    if (!expiresAtStr) {
      return false;
    }

    const expiresAt = parseInt(expiresAtStr);
    const now = Date.now();

    if (expiresAt > now) {
      return true;
    } else {
      // Expired - clean up
      await this.redisService.hdel(key, userId);
      return false;
    }
  }

  /**
   * Clear all typing indicators for a context
   */
  async clearTyping(
    context: 'room' | 'group' | 'dm',
    contextId: string
  ): Promise<void> {
    const key = this.getKey(context, contextId);
    const client = this.redisService.getClient();
    await client.del(key);

    this.logger.debug(
      `Cleared all typing indicators for ${context}:${contextId}`
    );
  }

  /**
   * Get Redis key for typing indicators
   */
  private getKey(context: 'room' | 'group' | 'dm', contextId: string): string {
    return `typing:${context}:${contextId}`;
  }
}
