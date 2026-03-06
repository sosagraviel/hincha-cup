import { Global, Module } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * Global module providing RedisService to the entire application.
 * No need to import explicitly -- available everywhere via @Global().
 *
 * @example
 * // Automatically available; just inject RedisService in any provider.
 * constructor(private readonly redis: RedisService) {}
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService]
})
export class RedisModule {}
