import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '@modules/redis/redis.service';

/**
 * Describes a user's real-time presence state with last-seen tracking.
 *
 * @example
 * // { userId: 'abc', lastSeen: 1708900000, status: 'online' }
 */
export interface UserPresence {
  userId: string;
  lastSeen: number; // Unix timestamp (seconds)
  status: 'online' | 'away' | 'offline';
}

/**
 * Manages user presence tracking using Redis sorted sets
 * - Online: last seen < 60 seconds ago
 * - Away: last seen 60-300 seconds ago
 * - Offline: last seen > 300 seconds ago
 */
@Injectable()
export class PresenceManager {
  private readonly logger = new Logger(PresenceManager.name);
  private readonly PRESENCE_KEY = 'presence:users';
  private readonly ONLINE_THRESHOLD = 60; // 60 seconds
  private readonly AWAY_THRESHOLD = 300; // 5 minutes

  constructor(private readonly redisService: RedisService) {}

  /**
   * Mark user as online (update last seen timestamp)
   */
  async markUserOnline(userId: string): Promise<void> {
    const now = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
    await this.redisService.zadd(this.PRESENCE_KEY, now, userId);
    this.logger.debug(`User ${userId} marked as online`);
  }

  /**
   * Get online users (last seen < 60 seconds ago)
   */
  async getOnlineUsers(): Promise<string[]> {
    const now = Math.floor(Date.now() / 1000);
    const minScore = now - this.ONLINE_THRESHOLD;
    return this.redisService.zrangebyscore(this.PRESENCE_KEY, minScore, now);
  }

  /**
   * Get away users (last seen 60-300 seconds ago)
   */
  async getAwayUsers(): Promise<string[]> {
    const now = Math.floor(Date.now() / 1000);
    const minScore = now - this.AWAY_THRESHOLD;
    const maxScore = now - this.ONLINE_THRESHOLD;
    return this.redisService.zrangebyscore(
      this.PRESENCE_KEY,
      minScore,
      maxScore
    );
  }

  /**
   * Get user's current status
   */
  async getUserStatus(userId: string): Promise<UserPresence['status']> {
    const client = this.redisService.getClient();
    const score = await client.zscore(this.PRESENCE_KEY, userId);

    if (!score) {
      return 'offline';
    }

    const now = Math.floor(Date.now() / 1000);
    const lastSeen = parseInt(score);
    const secondsAgo = now - lastSeen;

    if (secondsAgo < this.ONLINE_THRESHOLD) {
      return 'online';
    } else if (secondsAgo < this.AWAY_THRESHOLD) {
      return 'away';
    } else {
      return 'offline';
    }
  }

  /**
   * Get presence for multiple users
   */
  async getUsersPresence(userIds: string[]): Promise<UserPresence[]> {
    const client = this.redisService.getClient();
    const now = Math.floor(Date.now() / 1000);

    const presences: UserPresence[] = [];

    for (const userId of userIds) {
      const score = await client.zscore(this.PRESENCE_KEY, userId);
      let status: UserPresence['status'] = 'offline';
      let lastSeen = 0;

      if (score) {
        lastSeen = parseInt(score);
        const secondsAgo = now - lastSeen;

        if (secondsAgo < this.ONLINE_THRESHOLD) {
          status = 'online';
        } else if (secondsAgo < this.AWAY_THRESHOLD) {
          status = 'away';
        }
      }

      presences.push({ userId, lastSeen, status });
    }

    return presences;
  }

  /**
   * Remove user from presence tracking (on disconnect)
   */
  async removeUser(userId: string): Promise<void> {
    const client = this.redisService.getClient();
    await client.zrem(this.PRESENCE_KEY, userId);
    this.logger.debug(`User ${userId} removed from presence tracking`);
  }

  /**
   * Clean up old presence entries (offline > 24 hours)
   */
  async cleanup(): Promise<void> {
    const client = this.redisService.getClient();
    const now = Math.floor(Date.now() / 1000);
    const cutoff = now - 86400; // 24 hours ago

    const removed = await client.zremrangebyscore(
      this.PRESENCE_KEY,
      '-inf',
      cutoff
    );

    if (removed > 0) {
      this.logger.log(`Cleaned up ${removed} stale presence entries`);
    }
  }
}
