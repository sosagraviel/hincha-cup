import { Injectable } from '@nestjs/common';
import { ConfigGetOptions, ConfigService } from '@nestjs/config';
import { AllConfigType } from './config.type';

type PathsToStringProps<T> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends object
          ? K | `${K}.${PathsToStringProps<T[K]>}`
          : K
        : never;
    }[keyof T]
  : never;

type TypeAtPath<T, P extends string> = P extends keyof T
  ? T[P]
  : P extends `${infer Key}.${infer Rest}`
    ? Key extends keyof T
      ? TypeAtPath<T[Key], Rest>
      : never
    : never;

@Injectable()
export class TypedConfigService {
  constructor(private configService: ConfigService) {}

  get<P extends PathsToStringProps<AllConfigType>>(
    propertyPath: P,
    options?: ConfigGetOptions
  ): TypeAtPath<AllConfigType, P> | undefined;

  get<P extends PathsToStringProps<AllConfigType>>(
    propertyPath: P,
    defaultValue: TypeAtPath<AllConfigType, P>,
    options?: ConfigGetOptions
  ): TypeAtPath<AllConfigType, P>;

  get<P extends PathsToStringProps<AllConfigType>>(
    propertyPath: P,
    defaultValueOrOptions?: TypeAtPath<AllConfigType, P> | ConfigGetOptions,
    options?: ConfigGetOptions
  ): TypeAtPath<AllConfigType, P> | undefined {
    if (defaultValueOrOptions && options) {
      return this.configService.get(
        propertyPath as never,
        defaultValueOrOptions as any,
        options
      );
    }
    if (defaultValueOrOptions) {
      return this.configService.get(propertyPath, defaultValueOrOptions as any);
    }
    return this.configService.get(propertyPath);
  }
}
