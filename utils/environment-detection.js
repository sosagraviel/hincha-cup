/**
 * Environment Detection Utility
 *
 * Detects environment orchestration tools and configuration.
 * Supports: Docker Compose, Makefile, npm scripts, Kubernetes (future), Terraform (future)
 *
 * Usage:
 *   const detector = new EnvironmentDetector('/path/to/project');
 *   const env = await detector.detect();
 */

const fs = require('fs').promises;
const path = require('path');
const { existsSync } = require('fs');

class EnvironmentDetector {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.detected = {
      orchestrator: null,
      services: [],
      ports: {},
      commands: {
        up: null,
        down: null,
        logs: null,
        shell: null
      }
    };
  }

  /**
   * Detect environment orchestration
   * @returns {Promise<Object>} Detected environment configuration
   */
  async detect() {
    await this.detectDockerCompose();
    await this.detectMakefile();
    await this.detectNpmScripts();
    await this.detectKubernetes();

    return this.detected;
  }

  /**
   * Detect Docker Compose configuration
   */
  async detectDockerCompose() {
    const composeFiles = [
      'docker-compose.yml',
      'docker-compose.yaml',
      'compose.yml',
      'compose.yaml',
      'docker-compose.dev.yml',
      'docker-compose.development.yml'
    ];

    for (const file of composeFiles) {
      const filePath = path.join(this.projectRoot, file);
      if (existsSync(filePath)) {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const services = this.parseDockerComposeServices(content);
          const ports = this.parseDockerComposePorts(content);

          this.detected.orchestrator = 'docker-compose';
          this.detected.services = services;
          this.detected.ports = ports;
          this.detected.configFile = file;
          this.detected.commands = {
            up: `docker compose -f ${file} up -d`,
            down: `docker compose -f ${file} down`,
            logs: (service) => `docker compose -f ${file} logs -f ${service || ''}`,
            shell: (service) => `docker compose -f ${file} exec ${service} sh`,
            ps: `docker compose -f ${file} ps`,
            restart: (service) => `docker compose -f ${file} restart ${service || ''}`
          };

          return;
        } catch (error) {
          console.error(`Error reading ${file}: ${error.message}`);
        }
      }
    }
  }

  /**
   * Parse services from docker-compose.yml content
   * @param {string} content - docker-compose.yml content
   * @returns {string[]} List of service names
   */
  parseDockerComposeServices(content) {
    const services = [];
    const lines = content.split('\n');
    let inServicesSection = false;

    for (const line of lines) {
      if (line.trim() === 'services:') {
        inServicesSection = true;
        continue;
      }

      if (inServicesSection) {
        // Service names are indented with 2 spaces and followed by ':'
        const match = line.match(/^  ([a-zA-Z0-9_-]+):/);
        if (match) {
          services.push(match[1]);
        }

        // Exit services section if we hit another top-level key
        if (line.match(/^[a-zA-Z]/) && !line.startsWith('  ')) {
          inServicesSection = false;
        }
      }
    }

    return services;
  }

  /**
   * Parse ports from docker-compose.yml content
   * @param {string} content - docker-compose.yml content
   * @returns {Object} Service -> ports mapping
   */
  parseDockerComposePorts(content) {
    const ports = {};
    const lines = content.split('\n');
    let currentService = null;
    let inPortsSection = false;

    for (const line of lines) {
      // Detect service name
      const serviceMatch = line.match(/^  ([a-zA-Z0-9_-]+):/);
      if (serviceMatch) {
        currentService = serviceMatch[1];
        inPortsSection = false;
      }

      // Detect ports section
      if (line.trim() === 'ports:' && currentService) {
        inPortsSection = true;
        ports[currentService] = [];
        continue;
      }

      // Parse port mappings
      if (inPortsSection && line.match(/^\s+-\s+/)) {
        const portMatch = line.match(/^\s+-\s+"?(\d+):(\d+)"?/);
        if (portMatch) {
          ports[currentService].push({
            host: parseInt(portMatch[1]),
            container: parseInt(portMatch[2])
          });
        }
      }

      // Exit ports section
      if (inPortsSection && line.match(/^\s+[a-zA-Z]/)) {
        inPortsSection = false;
      }
    }

    return ports;
  }

  /**
   * Detect Makefile commands
   */
  async detectMakefile() {
    const makefilePath = path.join(this.projectRoot, 'Makefile');

    if (!existsSync(makefilePath)) {
      return;
    }

    try {
      const content = await fs.readFile(makefilePath, 'utf-8');
      const targets = this.parseMakefileTargets(content);

      // If Makefile has docker-related targets, use it as orchestrator
      const dockerTargets = ['up', 'down', 'logs', 'ps', 'restart'];
      const hasDockerTargets = dockerTargets.some(target => targets.includes(target));

      if (hasDockerTargets) {
        // If we already detected docker-compose, Makefile might be a wrapper
        if (this.detected.orchestrator === 'docker-compose') {
          this.detected.makefileWrapper = true;
          this.detected.commands = {
            up: 'make up',
            down: 'make down',
            logs: (service) => service ? `make logs s=${service}` : 'make logs',
            shell: (service) => `make sh s=${service}`,
            ps: 'make ps',
            restart: (service) => service ? `make restart s=${service}` : 'make restart'
          };
        } else {
          this.detected.orchestrator = 'makefile';
          this.detected.commands = {
            up: 'make up',
            down: 'make down',
            logs: 'make logs',
            shell: 'make sh',
            ps: 'make ps',
            restart: 'make restart'
          };
        }

        this.detected.makefileTargets = targets;
      }
    } catch (error) {
      console.error(`Error reading Makefile: ${error.message}`);
    }
  }

  /**
   * Parse Makefile targets
   * @param {string} content - Makefile content
   * @returns {string[]} List of target names
   */
  parseMakefileTargets(content) {
    const targets = [];
    const lines = content.split('\n');

    for (const line of lines) {
      // Match target definitions (name:)
      const match = line.match(/^([a-zA-Z0-9_-]+):/);
      if (match && !line.startsWith('\t')) {
        targets.push(match[1]);
      }
    }

    return targets;
  }

  /**
   * Detect npm/pnpm scripts for environment management
   */
  async detectNpmScripts() {
    const packageJsonPath = path.join(this.projectRoot, 'package.json');

    if (!existsSync(packageJsonPath)) {
      return;
    }

    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      const scripts = packageJson.scripts || {};

      // Check for dev server scripts
      const devScripts = ['start:dev', 'dev', 'serve'];
      const devScript = devScripts.find(s => scripts[s]);

      if (devScript && !this.detected.orchestrator) {
        this.detected.orchestrator = 'npm-scripts';
        this.detected.packageManager = this.detectPackageManager();
        this.detected.commands = {
          up: `${this.detected.packageManager} run ${devScript}`,
          down: null, // npm scripts don't typically have down
          logs: null,
          shell: null
        };
        this.detected.devScript = devScript;
      }
    } catch (error) {
      console.error(`Error reading package.json: ${error.message}`);
    }
  }

  /**
   * Detect package manager (npm, pnpm, yarn)
   * @returns {string} Package manager name
   */
  detectPackageManager() {
    if (existsSync(path.join(this.projectRoot, 'pnpm-lock.yaml'))) {
      return 'pnpm';
    }
    if (existsSync(path.join(this.projectRoot, 'yarn.lock'))) {
      return 'yarn';
    }
    return 'npm';
  }

  /**
   * Detect Kubernetes configuration (future support)
   */
  async detectKubernetes() {
    const k8sFiles = [
      'k8s',
      'kubernetes',
      '.k8s'
    ];

    for (const dir of k8sFiles) {
      const dirPath = path.join(this.projectRoot, dir);
      if (existsSync(dirPath)) {
        this.detected.kubernetes = {
          configDir: dir,
          detected: true
        };
        // Note: Kubernetes support is for future implementation
        // For now, just detect its presence
        return;
      }
    }
  }

  /**
   * Create environment override configuration for parallel tickets
   * @param {string} jiraKey - JIRA ticket key (e.g., "PROJ-123")
   * @param {Object} portMapping - Port overrides { service: port }
   * @returns {Object} Override configuration
   */
  createOverrideConfig(jiraKey, portMapping) {
    if (this.detected.orchestrator !== 'docker-compose') {
      throw new Error('Override config only supported for docker-compose');
    }

    const overrideFileName = `docker-compose.${jiraKey}.yml`;
    const overrideContent = this.generateDockerComposeOverride(portMapping);

    return {
      fileName: overrideFileName,
      content: overrideContent,
      commands: {
        up: `docker compose -f ${this.detected.configFile} -f ${overrideFileName} up -d`,
        down: `docker compose -f ${this.detected.configFile} -f ${overrideFileName} down`,
        logs: (service) => `docker compose -f ${this.detected.configFile} -f ${overrideFileName} logs -f ${service || ''}`,
        shell: (service) => `docker compose -f ${this.detected.configFile} -f ${overrideFileName} exec ${service} sh`
      }
    };
  }

  /**
   * Generate docker-compose override file content
   * @param {Object} portMapping - Service -> port mapping
   * @returns {string} YAML content
   */
  generateDockerComposeOverride(portMapping) {
    let yaml = `# Docker Compose override for isolated environment\n`;
    yaml += `# Auto-generated for ticket environment\n\n`;
    yaml += `services:\n`;

    for (const [service, ports] of Object.entries(portMapping)) {
      yaml += `  ${service}:\n`;
      yaml += `    ports:\n`;

      if (Array.isArray(ports)) {
        for (const portConfig of ports) {
          yaml += `      - "${portConfig.host}:${portConfig.container}"\n`;
        }
      } else {
        // Simple port mapping
        const originalPort = this.detected.ports[service]?.[0]?.container || 8080;
        yaml += `      - "${ports}:${originalPort}"\n`;
      }
    }

    return yaml;
  }

  /**
   * Get summary of detected environment
   * @returns {Object} Summary
   */
  getSummary() {
    return {
      orchestrator: this.detected.orchestrator,
      serviceCount: this.detected.services.length,
      services: this.detected.services,
      hasDockerCompose: this.detected.orchestrator === 'docker-compose',
      hasMakefile: this.detected.makefileWrapper || this.detected.orchestrator === 'makefile',
      hasKubernetes: !!this.detected.kubernetes
    };
  }
}

module.exports = { EnvironmentDetector };
