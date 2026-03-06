import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TypedConfigService } from './config/typed-config.service';

/**
 * Application-level service providing health check endpoints.
 * Verifies database connectivity (via SELECT 1) and Keycloak readiness (via /health/ready).
 *
 * @example
 * const health = await appService.getHealth();
 * // { status: 'ok' } or { status: 'error', checks: { database: 'ok', keycloak: 'error' } }
 */
@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly configService: TypedConfigService
  ) {}

  async getHealth(): Promise<{
    status: string;
    checks?: { database: string; keycloak: string };
  }> {
    try {
      const dbCheck = await this.checkDatabaseConnection();
      const keycloakCheck = await this.checkKeycloakConnection();

      if (dbCheck && keycloakCheck) {
        return { status: 'ok' };
      }

      return {
        status: 'error',
        checks: {
          database: dbCheck ? 'ok' : 'error',
          keycloak: keycloakCheck ? 'ok' : 'error'
        }
      };
    } catch (error) {
      this.logger.error('Health check failed', error);
      return {
        status: 'error',
        checks: {
          database: 'error',
          keycloak: 'error'
        }
      };
    }
  }

  private async checkDatabaseConnection(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch (error) {
      this.logger.error('Database health check failed', error);
      return false;
    }
  }

  private async checkKeycloakConnection(): Promise<boolean> {
    try {
      const keycloakUrl =
        this.configService.get('keycloak.KEYCLOAK_INTERNAL_MGMT_URL') ||
        'http://localhost:9000';
      const healthEndpoint = `${keycloakUrl}/health/ready`;

      const response = await fetch(healthEndpoint, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });

      return response.ok;
    } catch (error) {
      this.logger.error('Keycloak health check failed', error);
      return false;
    }
  }
}
