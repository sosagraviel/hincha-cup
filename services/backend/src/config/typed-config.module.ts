/**
 * Global configuration module that loads and validates all environment-based configs
 * (app, database, keycloak) via NestJS ConfigModule.forRoot. Exposes TypedConfigService
 * for strongly-typed access throughout the application.
 *
 * @example
 * // Resolves .env files based on NODE_ENV: .env.development, .env.testing, etc.
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypedConfigService } from './typed-config.service';

import databaseConfig from '../database/database.config';
import appConfig from './app.config';
import keycloakConfig from '@modules/config/keycloak.config';
@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: [
        `./.env.${process.env.NODE_ENV}`,
        `../.env.${process.env.NODE_ENV}`,
        `../../.env.${process.env.NODE_ENV}`
      ],
      load: [appConfig, databaseConfig, keycloakConfig],
      isGlobal: true
    })
  ],
  providers: [TypedConfigService],
  exports: [TypedConfigService]
})
export class TypedConfigModule {}
