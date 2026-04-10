import { execSync } from 'child_process';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { chromium, Browser, Page } from 'playwright';

/**
 * Environment Manager Service
 *
 * Manages isolated development environments for ticket implementation:
 * - Port allocation via ticket ID hashing (supports 500+ concurrent tickets)
 * - Docker Compose override file generation
 * - Service start/stop
 * - Playwright browser initialization
 *
 * Port Allocation Strategy:
 * - Range: 10000-59999 (50,000 ports)
 * - Hash ticket ID to deterministic port
 * - Supports ~500 concurrent tickets with minimal collisions
 */

export interface EnvironmentConfig {
  ticketId: string;
  projectPath: string;
  port: number;
  dockerComposeOverride?: string;
  playwrightInitialized: boolean;
}

export interface ServiceStatus {
  running: boolean;
  port: number;
  healthCheckUrl?: string;
}

/**
 * Service for managing isolated development environments
 */
export class EnvironmentManagerService {
  private projectPath: string;
  private browser?: Browser;
  private page?: Page;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Allocate a deterministic port for a ticket ID
   *
   * Uses simple hash function to map ticket ID to port in range 10000-59999
   * Deterministic: same ticket ID always gets same port (supports resume)
   *
   * @param ticketId - Ticket ID (e.g., "PROJ-123")
   * @returns Port number between 10000-59999
   */
  allocatePort(ticketId: string): number {
    // Simple hash function: sum of character codes
    let hash = 0;
    for (let i = 0; i < ticketId.length; i++) {
      hash = (hash << 5) - hash + ticketId.charCodeAt(i);
      hash = hash & hash; // Convert to 32bit integer
    }

    // Map to port range 10000-59999 (50,000 ports)
    const portRange = 50000;
    const portOffset = 10000;
    const port = portOffset + (Math.abs(hash) % portRange);

    return port;
  }

  /**
   * Generate Docker Compose override file for ticket-specific environment
   *
   * Creates docker-compose.{ticketId}.yml with:
   * - Port overrides (map host port to container port)
   * - Environment variable overrides if needed
   *
   * @param ticketId - Ticket ID
   * @param port - Allocated port
   * @param baseComposeFile - Path to base docker-compose.yml (optional)
   * @returns Path to generated override file
   */
  generateDockerComposeOverride(ticketId: string, port: number, baseComposeFile?: string): string {
    // Validate base compose file exists
    const defaultComposeFile = join(this.projectPath, 'docker-compose.yml');
    const composeFile = baseComposeFile || defaultComposeFile;

    if (!existsSync(composeFile)) {
      throw new Error(
        `Docker Compose file not found: ${composeFile}\n` +
          `Cannot generate override without base compose file.`,
      );
    }

    // Parse base compose file to determine default port
    const baseComposeContent = readFileSync(composeFile, 'utf-8');
    const defaultPort = this.extractDefaultPort(baseComposeContent);

    // Generate override file
    const overrideContent = `# Auto-generated Docker Compose override for ${ticketId}
# Allocated port: ${port}

version: '3.8'

services:
  app:
    ports:
      - "${port}:${defaultPort}"
    environment:
      - PORT=${defaultPort}
      - TICKET_ID=${ticketId}
`;

    const overrideFile = join(this.projectPath, `docker-compose.${ticketId}.yml`);
    writeFileSync(overrideFile, overrideContent);

    console.log(`[EnvironmentManager] Generated Docker Compose override: ${overrideFile}`);

    return overrideFile;
  }

  /**
   * Extract default port from docker-compose.yml
   *
   * Looks for patterns like:
   * - "3000:3000"
   * - "3000:${PORT}"
   *
   * @param composeContent - Docker Compose file content
   * @returns Default port (fallback: 3000)
   */
  private extractDefaultPort(composeContent: string): number {
    // Look for port mapping patterns
    const portMatch = composeContent.match(/"?(\d+):(\d+|\$\{PORT\})"?/);

    if (portMatch) {
      // Return the container port (right side of mapping)
      const containerPort = portMatch[2];
      if (containerPort.startsWith('${')) {
        // If using env var, try to extract from environment section
        const envMatch = composeContent.match(/PORT[=:](\d+)/);
        return envMatch ? parseInt(envMatch[1], 10) : 3000;
      }
      return parseInt(containerPort, 10);
    }

    // Fallback: default port 3000
    return 3000;
  }

  /**
   * Start Docker Compose services with override
   *
   * @param ticketId - Ticket ID
   * @param overrideFile - Path to docker-compose override file
   * @param detached - Run in detached mode (default: true)
   * @returns true if started successfully
   */
  async startDockerServices(
    ticketId: string,
    overrideFile: string,
    detached: boolean = true,
  ): Promise<boolean> {
    try {
      const baseComposeFile = join(this.projectPath, 'docker-compose.yml');

      if (!existsSync(baseComposeFile)) {
        console.log(`[EnvironmentManager] No docker-compose.yml found, skipping Docker setup`);
        return false;
      }

      const detachedFlag = detached ? '-d' : '';

      console.log(`[EnvironmentManager] Starting Docker services for ${ticketId}...`);

      execSync(`docker-compose -f ${baseComposeFile} -f ${overrideFile} up ${detachedFlag}`, {
        cwd: this.projectPath,
        stdio: 'inherit',
      });

      // Wait for services to be ready (simple sleep for now)
      if (detached) {
        console.log(`[EnvironmentManager] Waiting 10s for services to start...`);
        await new Promise((resolve) => setTimeout(resolve, 10000));
      }

      console.log(`[EnvironmentManager] ✓ Docker services started`);
      return true;
    } catch (error: any) {
      console.error(`[EnvironmentManager] Failed to start Docker services: ${error.message}`);
      return false;
    }
  }

  /**
   * Stop Docker Compose services
   *
   * @param ticketId - Ticket ID
   * @param overrideFile - Path to docker-compose override file
   * @returns true if stopped successfully
   */
  async stopDockerServices(ticketId: string, overrideFile: string): Promise<boolean> {
    try {
      const baseComposeFile = join(this.projectPath, 'docker-compose.yml');

      if (!existsSync(baseComposeFile) || !existsSync(overrideFile)) {
        console.log(`[EnvironmentManager] Docker files not found, skipping stop`);
        return false;
      }

      console.log(`[EnvironmentManager] Stopping Docker services for ${ticketId}...`);

      execSync(`docker-compose -f ${baseComposeFile} -f ${overrideFile} down`, {
        cwd: this.projectPath,
        stdio: 'inherit',
      });

      console.log(`[EnvironmentManager] ✓ Docker services stopped`);
      return true;
    } catch (error: any) {
      console.error(`[EnvironmentManager] Failed to stop Docker services: ${error.message}`);
      return false;
    }
  }

  /**
   * Check if service is running on allocated port
   *
   * @param port - Port to check
   * @returns Service status
   */
  async checkServiceStatus(port: number): Promise<ServiceStatus> {
    try {
      // Try to connect to localhost:port
      const healthCheckUrl = `http://localhost:${port}`;

      const response = await fetch(healthCheckUrl, {
        method: 'GET',
        signal: AbortSignal.timeout(2000), // 2 second timeout
      });

      return {
        running: response.ok || response.status < 500,
        port,
        healthCheckUrl,
      };
    } catch (error) {
      // Connection failed - service not running
      return {
        running: false,
        port,
      };
    }
  }

  /**
   * Initialize Playwright browser for screenshot capture
   *
   * @param headless - Run in headless mode (default: true)
   * @returns true if initialized successfully
   */
  async initializePlaywright(headless: boolean = true): Promise<boolean> {
    try {
      console.log(`[EnvironmentManager] Initializing Playwright (headless: ${headless})...`);

      this.browser = await chromium.launch({ headless });
      this.page = await this.browser.newPage();

      console.log(`[EnvironmentManager] ✓ Playwright initialized`);
      return true;
    } catch (error: any) {
      console.error(`[EnvironmentManager] Failed to initialize Playwright: ${error.message}`);
      return false;
    }
  }

  /**
   * Get Playwright page instance
   *
   * @returns Playwright Page instance
   */
  getPlaywrightPage(): Page | undefined {
    return this.page;
  }

  /**
   * Close Playwright browser
   */
  async closePlaywright(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = undefined;
      this.page = undefined;
      console.log(`[EnvironmentManager] ✓ Playwright closed`);
    }
  }

  /**
   * Setup complete environment for ticket
   *
   * Combines all setup steps:
   * 1. Allocate port
   * 2. Generate Docker Compose override
   * 3. Start Docker services
   * 4. Initialize Playwright
   *
   * @param ticketId - Ticket ID
   * @param initPlaywright - Whether to initialize Playwright (default: true)
   * @returns Environment configuration
   */
  async setupEnvironment(
    ticketId: string,
    initPlaywright: boolean = true,
  ): Promise<EnvironmentConfig> {
    console.log(`\n[EnvironmentManager] Setting up environment for ${ticketId}...`);

    // 1. Allocate port
    const port = this.allocatePort(ticketId);
    console.log(`[EnvironmentManager] Allocated port: ${port}`);

    // 2. Generate Docker Compose override (if docker-compose.yml exists)
    let dockerComposeOverride: string | undefined;
    const baseComposeFile = join(this.projectPath, 'docker-compose.yml');

    if (existsSync(baseComposeFile)) {
      dockerComposeOverride = this.generateDockerComposeOverride(ticketId, port);

      // 3. Start Docker services
      await this.startDockerServices(ticketId, dockerComposeOverride);
    } else {
      console.log(`[EnvironmentManager] No docker-compose.yml found, skipping Docker setup`);
    }

    // 4. Initialize Playwright (if requested)
    let playwrightInitialized = false;
    if (initPlaywright) {
      playwrightInitialized = await this.initializePlaywright();
    }

    console.log(`[EnvironmentManager] ✓ Environment setup complete\n`);

    return {
      ticketId,
      projectPath: this.projectPath,
      port,
      dockerComposeOverride,
      playwrightInitialized,
    };
  }

  /**
   * Teardown environment for ticket
   *
   * Combines all teardown steps:
   * 1. Close Playwright
   * 2. Stop Docker services
   *
   * @param ticketId - Ticket ID
   * @param dockerComposeOverride - Path to Docker Compose override file
   */
  async teardownEnvironment(ticketId: string, dockerComposeOverride?: string): Promise<void> {
    console.log(`\n[EnvironmentManager] Tearing down environment for ${ticketId}...`);

    // 1. Close Playwright
    await this.closePlaywright();

    // 2. Stop Docker services
    if (dockerComposeOverride && existsSync(dockerComposeOverride)) {
      await this.stopDockerServices(ticketId, dockerComposeOverride);
    }

    console.log(`[EnvironmentManager] ✓ Environment teardown complete\n`);
  }
}
