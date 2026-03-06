import { AppConfig } from './app.config';
import { DatabaseConfig } from '@src/database/database.config';
import { KeycloakConfig } from '@modules/config/keycloak.config';

export type AllConfigType = {
  app: AppConfig;
  database: DatabaseConfig;
  keycloak: KeycloakConfig;
};
