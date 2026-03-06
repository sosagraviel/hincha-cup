import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  InternalServerErrorException
} from '@nestjs/common';
import { BaseResponseDto } from '@livonit/shared';
import {
  ClassConstructor,
  instanceToPlain,
  plainToInstance
} from 'class-transformer';
import { validate } from 'class-validator';
import { Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';

/**
 * Transforms a response item through class-transformer and validates it with
 * class-validator. Only processes instances of BaseResponseDto; other values
 * pass through unchanged. Throws InternalServerErrorException on validation failure.
 */
async function transformAndValidate(item: any) {
  if (!(item instanceof BaseResponseDto)) {
    return item;
  }

  const transformedData = plainToInstance(
    Object.getPrototypeOf(item).constructor as ClassConstructor<any>,
    instanceToPlain(item)
  );

  const errors = await validate(transformedData);
  if (errors.length > 0) {
    throw new InternalServerErrorException({
      message: 'Response validation failed',
      errors
    });
  }
  return transformedData;
}

/**
 * Response interceptor that validates outgoing DTOs extending BaseResponseDto
 * through class-transformer + class-validator. Ensures API responses conform to
 * their declared DTO shape. Non-DTO responses pass through unchanged.
 *
 * @example
 * // Registered globally in main.ts:
 * app.useGlobalInterceptors(new TransformAndValidateResponseInterceptor());
 */
@Injectable()
export class TransformAndValidateResponseInterceptor
  implements NestInterceptor
{
  intercept(_context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      switchMap(async data => {
        if (Array.isArray(data)) {
          if (data.length === 0) {
            return data;
          }
          return Promise.all(data.map(item => transformAndValidate(item)));
        }
        return transformAndValidate(data);
      })
    );
  }
}
