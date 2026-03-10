/**
 * Environment Manager Utility
 *
 * Manages isolated environments for parallel ticket implementation.
 * Handles port allocation, environment setup/teardown, and configuration.
 *
 * Usage:
 *   const manager = new EnvironmentManager('PROJ-123', '/path/to/project');
 *   const env = await manager.setup();
 *   // ... work on ticket ...
 *   await manager.teardown();
 */

const fs = require('fs').promises;
const path = require('path');
const { existsSync } = require('fs');
const crypto = require('crypto');
const { EnvironmentDetector } = require('./environment-detection');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

class EnvironmentManager {
  static BASE_PORT_RANGE = 10000;
  static PORT_RANGE_SIZE = 100;
  static CLAUDE_ENV_DIR = '.claude/environments';

  constructor(jiraKey, projectRoot) {
    this.jiraKey = jiraKey;
    this.projectRoot = projectRoot;
    this.envDir = path.join(projectRoot, EnvironmentManager.CLAUDE_ENV_DIR);
    this.envConfigPath = path.join(this.envDir, `${jiraKey}.json`);
    this.allocatedPorts = new Map();
    this.detector = new EnvironmentDetector(projectRoot);
  }

  /**
   * Setup isolated environment for ticket
   * @returns {Promise<Object>} Environment configuration
   */
  async setup() {
    console.log(`[EnvironmentManager] Setting up environment for ${this.jiraKey}`);

    // 1. Detect environment orchestration
    const envConfig = await this.detector.detect();

    if (!envConfig.orchestrator) {
      console.warn('[EnvironmentManager] No environment orchestrator detected. Skipping environment setup.');
      return {
        jiraKey: this.jiraKey,
        isolated: false,
        orchestrator: 'none',
        message: 'No docker-compose or makefile detected'
      };
    }

    // 2. Allocate port range
    const ports = await this.allocatePortRange(envConfig);

    // 3. Create environment directory
    await this.ensureEnvDirectory();

    // 4. Create override configuration
    const overrideConfig = await this.createOverrideConfiguration(envConfig, ports);

    // 5. Start environment
    await this.startEnvironment(overrideConfig);

    // 6. Save environment configuration
    const config = {
      jiraKey: this.jiraKey,
      isolated: true,
      orchestrator: envConfig.orchestrator,
      ports,
      overrideFile: overrideConfig.fileName,
      commands: overrideConfig.commands,
      createdAt: new Date().toISOString(),
      status: 'running'
    };

    await this.saveConfig(config);

    console.log(`[EnvironmentManager] Environment ready for ${this.jiraKey}`);
    console.log(`[EnvironmentManager] Allocated ports:`, ports);

    return config;
  }

  /**
   * Allocate deterministic port range based on JIRA key
   * @param {Object} envConfig - Environment configuration
   * @returns {Promise<Object>} Port mapping
   */
  async allocatePortRange(envConfig) {
    const hash = this.hashJiraKey(this.jiraKey);
    const rangeIndex = hash % 500; // Support 500 parallel tickets (ports 10000-59999)
    const basePort = EnvironmentManager.BASE_PORT_RANGE + (rangeIndex * EnvironmentManager.PORT_RANGE_SIZE);

    const ports = {};
    let portOffset = 0;

    // Allocate ports for each service
    for (const service of envConfig.services) {
      const originalPorts = envConfig.ports[service] || [];

      if (originalPorts.length > 0) {
        // Map each original port to new isolated port
        ports[service] = originalPorts.map((portConfig, index) => ({
          host: basePort + portOffset + index,
          container: portConfig.container,
          original: portConfig.host
        }));
        portOffset += originalPorts.length;
      } else {
        // Service has no ports defined, skip
        continue;
      }

      // Check if ports are available
      for (const portConfig of ports[service]) {
        if (await this.isPortInUse(portConfig.host)) {
          throw new Error(`Port ${portConfig.host} for ${service} is already in use`);
        }
      }
    }

    return ports;
  }

  /**
   * Hash JIRA key to get deterministic range index
   * @param {string} jiraKey - JIRA ticket key
   * @returns {number} Hash value
   */
  hashJiraKey(jiraKey) {
    const hash = crypto.createHash('md5').update(jiraKey).digest('hex');
    return parseInt(hash.substring(0, 8), 16);
  }

  /**
   * Check if port is in use
   * @param {number} port - Port number
   * @returns {Promise<boolean>} True if port is in use
   */
  async isPortInUse(port) {
    try {
      const { stdout } = await execAsync(`lsof -i :${port} || netstat -an | grep ${port}`);
      return stdout.trim().length > 0;
    } catch (error) {
      // Command returns non-zero exit code if port is not in use
      return false;
    }
  }

  /**
   * Ensure environment directory exists
   */
  async ensureEnvDirectory() {
    if (!existsSync(this.envDir)) {
      await fs.mkdir(this.envDir, { recursive: true });
    }
  }

  /**
   * Create docker-compose override configuration
   * @param {Object} envConfig - Environment configuration
   * @param {Object} ports - Port mapping
   * @returns {Promise<Object>} Override configuration
   */
  async createOverrideConfiguration(envConfig, ports) {
    const overrideFileName = `docker-compose.${this.jiraKey}.yml`;
    const overrideFilePath = path.join(this.projectRoot, overrideFileName);

    // Generate override content
    let yaml = `# Docker Compose override for ${this.jiraKey}\n`;
    yaml += `# Auto-generated by Environment Manager\n`;
    yaml += `# Created: ${new Date().toISOString()}\n\n`;
    yaml += `services:\n`;

    for (const [service, servicePorts] of Object.entries(ports)) {
      yaml += `  ${service}:\n`;
      yaml += `    container_name: ${service}-${this.jiraKey.toLowerCase()}\n`;
      yaml += `    ports:\n`;

      for (const portConfig of servicePorts) {
        yaml += `      - "${portConfig.host}:${portConfig.container}"\n`;
      }

      // Add environment variables for service URLs with new ports
      if (service === 'backend') {
        yaml += `    environment:\n`;
        yaml += `      - PORT=${servicePorts[0].container}\n`;
        yaml += `      - API_PORT=${servicePorts[0].host}\n`;
      }

      if (service === 'frontend') {
        yaml += `    environment:\n`;
        yaml += `      - PORT=${servicePorts[0].container}\n`;
        yaml += `      - VITE_PORT=${servicePorts[0].host}\n`;
      }
    }

    // Write override file
    await fs.writeFile(overrideFilePath, yaml, 'utf-8');

    const baseComposeFile = envConfig.configFile || 'docker-compose.yml';

    return {
      fileName: overrideFileName,
      filePath: overrideFilePath,
      commands: {
        up: `docker compose -f ${baseComposeFile} -f ${overrideFileName} up -d`,
        down: `docker compose -f ${baseComposeFile} -f ${overrideFileName} down`,
        logs: (service) => `docker compose -f ${baseComposeFile} -f ${overrideFileName} logs -f ${service || ''}`,
        shell: (service) => `docker compose -f ${baseComposeFile} -f ${overrideFileName} exec ${service} sh`,
        ps: `docker compose -f ${baseComposeFile} -f ${overrideFileName} ps`,
        restart: (service) => `docker compose -f ${baseComposeFile} -f ${overrideFileName} restart ${service || ''}`
      }
    };
  }

  /**
   * Start environment
   * @param {Object} overrideConfig - Override configuration
   */
  async startEnvironment(overrideConfig) {
    console.log(`[EnvironmentManager] Starting environment with: ${overrideConfig.commands.up}`);

    try {
      const { stdout, stderr } = await execAsync(overrideConfig.commands.up, {
        cwd: this.projectRoot
      });

      if (stderr && !stderr.includes('Creating') && !stderr.includes('Starting')) {
        console.warn(`[EnvironmentManager] Docker compose stderr:`, stderr);
      }

      console.log(`[EnvironmentManager] Environment started successfully`);

      // Wait for services to be healthy
      await this.waitForHealthy(overrideConfig);

    } catch (error) {
      console.error(`[EnvironmentManager] Failed to start environment:`, error.message);
      throw new Error(`Environment startup failed: ${error.message}`);
    }
  }

  /**
   * Wait for services to become healthy
   * @param {Object} overrideConfig - Override configuration
   * @param {number} maxWaitSeconds - Maximum wait time
   */
  async waitForHealthy(overrideConfig, maxWaitSeconds = 60) {
    console.log(`[EnvironmentManager] Waiting for services to be healthy...`);

    const startTime = Date.now();
    let healthy = false;

    while (!healthy && (Date.now() - startTime) < maxWaitSeconds * 1000) {
      try {
        const { stdout } = await execAsync(overrideConfig.commands.ps, {
          cwd: this.projectRoot
        });

        // Check if all services are "running" (not "starting" or "unhealthy")
        const lines = stdout.split('\n').filter(line => line.trim());
        const serviceLines = lines.slice(1); // Skip header

        if (serviceLines.length === 0) {
          await this.sleep(2000);
          continue;
        }

        const allRunning = serviceLines.every(line =>
          line.includes('Up') || line.includes('running')
        );

        if (allRunning) {
          healthy = true;
          console.log(`[EnvironmentManager] All services are healthy`);
        } else {
          await this.sleep(2000);
        }
      } catch (error) {
        await this.sleep(2000);
      }
    }

    if (!healthy) {
      throw new Error('Services did not become healthy within timeout');
    }
  }

  /**
   * Sleep utility
   * @param {number} ms - Milliseconds to sleep
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Teardown environment
   */
  async teardown() {
    console.log(`[EnvironmentManager] Tearing down environment for ${this.jiraKey}`);

    // Load config
    const config = await this.loadConfig();

    if (!config || !config.isolated) {
      console.log(`[EnvironmentManager] No isolated environment to teardown`);
      return;
    }

    // Stop environment
    if (config.commands && config.commands.down) {
      try {
        console.log(`[EnvironmentManager] Stopping environment: ${config.commands.down}`);
        await execAsync(config.commands.down, { cwd: this.projectRoot });
        console.log(`[EnvironmentManager] Environment stopped`);
      } catch (error) {
        console.error(`[EnvironmentManager] Error stopping environment:`, error.message);
      }
    }

    // Remove override file
    if (config.overrideFile) {
      const overrideFilePath = path.join(this.projectRoot, config.overrideFile);
      if (existsSync(overrideFilePath)) {
        await fs.unlink(overrideFilePath);
        console.log(`[EnvironmentManager] Removed override file: ${config.overrideFile}`);
      }
    }

    // Remove config file
    if (existsSync(this.envConfigPath)) {
      await fs.unlink(this.envConfigPath);
      console.log(`[EnvironmentManager] Removed config file`);
    }

    console.log(`[EnvironmentManager] Teardown complete`);
  }

  /**
   * Save environment configuration
   * @param {Object} config - Configuration to save
   */
  async saveConfig(config) {
    await fs.writeFile(this.envConfigPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  /**
   * Load environment configuration
   * @returns {Promise<Object|null>} Configuration or null
   */
  async loadConfig() {
    if (!existsSync(this.envConfigPath)) {
      return null;
    }

    try {
      const content = await fs.readFile(this.envConfigPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`[EnvironmentManager] Error loading config:`, error.message);
      return null;
    }
  }

  /**
   * Get environment status
   * @returns {Promise<Object>} Status information
   */
  async getStatus() {
    const config = await this.loadConfig();

    if (!config) {
      return {
        jiraKey: this.jiraKey,
        exists: false,
        status: 'not-created'
      };
    }

    return {
      jiraKey: this.jiraKey,
      exists: true,
      isolated: config.isolated,
      status: config.status,
      ports: config.ports,
      createdAt: config.createdAt
    };
  }

  /**
   * List all active environments
   * @param {string} projectRoot - Project root directory
   * @returns {Promise<Array>} List of active environments
   */
  static async listAll(projectRoot) {
    const envDir = path.join(projectRoot, EnvironmentManager.CLAUDE_ENV_DIR);

    if (!existsSync(envDir)) {
      return [];
    }

    const files = await fs.readdir(envDir);
    const envFiles = files.filter(f => f.endsWith('.json'));

    const environments = [];

    for (const file of envFiles) {
      try {
        const content = await fs.readFile(path.join(envDir, file), 'utf-8');
        const config = JSON.parse(content);
        environments.push(config);
      } catch (error) {
        console.error(`Error reading ${file}:`, error.message);
      }
    }

    return environments;
  }
}

module.exports = { EnvironmentManager };
