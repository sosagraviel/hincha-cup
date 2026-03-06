import { ArgumentMetadata, ParseUUIDPipe } from '@nestjs/common';
import { ArgumentInvalidException } from '../exceptions';

/**
 * Custom UUID validation pipe that wraps NestJS ParseUUIDPipe and throws
 * an ArgumentInvalidException with a descriptive message on invalid UUIDs.
 *
 * @example
 * @Get(':id')
 * findOne(@Param('id', CustomUUIDPipe) id: string) { ... }
 */
export class CustomUUIDPipe extends ParseUUIDPipe {
  async transform(value: string, metadata: ArgumentMetadata) {
    try {
      return await super.transform(value, metadata);
    } catch (_error) {
      throw new ArgumentInvalidException(
        `Invalid UUID format for ${metadata.data || 'parameter'}`
      );
    }
  }
}
