import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

/**
 * Root controller exposing health-check endpoints for liveness and readiness probes.
 *
 * @example
 * // GET /health      -> { status: 'ok', checks: { database, keycloak } }
 * // GET /health/ready -> { status: 'ok' }
 */
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get('/health')
  async getHealth(): Promise<{
    status: string;
    checks?: { database: string; keycloak: string };
  }> {
    return this.appService.getHealth();
  }

  @Get('/health/ready')
  getHealthReady(): { status: string } {
    return { status: 'ok' };
  }
}
