/**
 * Keycloak OpenID Connect configuration loaded from environment variables.
 * Validates internal/external URLs, admin credentials, realm, client IDs, and optional test/mgmt settings.
 * Registered as the 'keycloak' config namespace via NestJS ConfigModule.
 *
 * @example
 * const realm = configService.get('keycloak.KEYCLOAK_REALM'); // 'boilerplate'
 */
import { registerAs } from '@nestjs/config';
import { IsOptional, IsString } from 'class-validator';
import { validateAndPickKeys } from '@src/libs/utils/validateAndPickKeys';
import { Expose } from 'class-transformer';

class KeycloakServiceValidator {
  @IsString()
  @Expose()
  KEYCLOAK_INTERNAL_URL: string;

  @IsString()
  @Expose()
  KEYCLOAK_EXTERNAL_URL: string;

  @IsString()
  @Expose()
  KEYCLOAK_ADMIN_USERNAME: string;

  @IsString()
  @Expose()
  KEYCLOAK_ADMIN_PASSWORD: string;

  @IsString()
  @Expose()
  KEYCLOAK_CLIENT_ID: string;

  @IsString()
  @Expose()
  KEYCLOAK_REALM: string;

  @IsString()
  @IsOptional()
  @Expose()
  KEYCLOAK_BACKEND_CLIENT_ID?: string;

  @IsString()
  @IsOptional()
  @Expose()
  KEYCLOAK_BACKEND_CLIENT_SECRET?: string;

  @IsString()
  @IsOptional()
  @Expose()
  KEYCLOAK_TEST_CLIENT_NAME?: string;

  @IsString()
  @IsOptional()
  @Expose()
  KEYCLOAK_TEST_CLIENT_SECRET?: string;

  @IsString()
  @IsOptional()
  @Expose()
  KEYCLOAK_EXTERNAL_MGMT_URL?: string;

  @IsString()
  @IsOptional()
  @Expose()
  KEYCLOAK_INTERNAL_MGMT_URL?: string;
}

export const keycloakConfig = () =>
  validateAndPickKeys(process.env, KeycloakServiceValidator);

export type KeycloakConfig = ReturnType<typeof keycloakConfig>;

export default registerAs<KeycloakConfig>('keycloak', keycloakConfig);
