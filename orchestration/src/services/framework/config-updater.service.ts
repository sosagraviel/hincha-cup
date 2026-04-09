/**
 * Config Updater Service
 *
 * Manages framework configuration, resource state tracking, and sync operations.
 * Migrated from utils/config/config-updater.js
 */

import { readFile, writeFile, mkdir, readdir, stat } from 'fs/promises';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import { z } from 'zod';
import {
  FrameworkConfigSchema,
  type FrameworkConfig,
  type ResourceInfo,
} from '../../schemas/index.js';
import { type Service } from '../../schemas/stack-profile.schema.js';

// Re-export types for backward compatibility
export type { FrameworkConfig, ResourceInfo };

export interface UserModification {
  name: string;
  path: string;
  expectedHash: string;
  currentHash: string;
}

export interface UserModifications {
  skills: UserModification[];
  agents: UserModification[];
}

export interface VersionInfo {
  updated: boolean;
  current: string;
  configured: string;
}

export interface ValidationResult {
  valid: boolean;
  errors?: any[];
}

export class ConfigUpdaterService {
  private projectPath: string;
  private frameworkPath: string;
  private configPath: string;

  constructor(projectPath: string, frameworkPath: string) {
    this.projectPath = projectPath;
    this.frameworkPath = frameworkPath;
    this.configPath = join(projectPath, '.claude', 'framework-config.json');
  }

  async readConfig(): Promise<FrameworkConfig> {
    if (!existsSync(this.configPath)) {
      throw new Error(`Configuration file not found: ${this.configPath}`);
    }

    const configContent = await readFile(this.configPath, 'utf-8');
    return JSON.parse(configContent);
  }

  async writeConfig(config: FrameworkConfig): Promise<void> {
    const dir = dirname(this.configPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }

    await writeFile(this.configPath, JSON.stringify(config, null, 2));
  }

  async validateConfig(config: FrameworkConfig): Promise<ValidationResult> {
    try {
      // Validate using zod schema
      FrameworkConfigSchema.parse(config);
      return { valid: true };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.issues.map((err: z.ZodIssue) => ({
            path: err.path.join('.'),
            message: err.message,
            code: err.code,
          })),
        };
      }

      return {
        valid: false,
        errors: [{ message: error instanceof Error ? error.message : String(error) }],
      };
    }
  }

  /**
   * @deprecated Use updateService() instead for service-centric stack profile management
   *
   * This method is kept for backward compatibility but will be removed in a future version.
   * The new service-centric architecture uses the updateService() method to manage
   * individual services rather than updating languages/frameworks in bulk.
   */
  async updateStackProfile(): Promise<{ updated: boolean; config?: FrameworkConfig }> {
    console.warn('updateStackProfile() is deprecated. Use updateService() instead.');
    return { updated: false };
  }

  // ========== SERVICE MANAGEMENT METHODS ==========

  /**
   * Add or update a service in stack profile
   */
  async updateService(serviceConfig: Service): Promise<{ updated: boolean; config?: FrameworkConfig }> {
    const config = await this.readConfig();

    if (!config.stack_profile.services) {
      config.stack_profile.services = [];
    }

    const existingIndex = config.stack_profile.services.findIndex(
      (s: any) => s.id === serviceConfig.id
    );

    if (existingIndex >= 0) {
      config.stack_profile.services[existingIndex] = serviceConfig;
    } else {
      config.stack_profile.services.push(serviceConfig);
    }

    await this.writeConfig(config);
    return { updated: true, config };
  }

  /**
   * Remove service from stack profile
   */
  async removeService(serviceId: string): Promise<boolean> {
    const config = await this.readConfig();

    if (!config.stack_profile.services) return false;

    const originalLength = config.stack_profile.services.length;
    config.stack_profile.services = config.stack_profile.services.filter(
      (s: any) => s.id !== serviceId
    );

    if (config.stack_profile.services.length < originalLength) {
      await this.writeConfig(config);
      return true;
    }

    return false;
  }

  /**
   * Get service by ID
   */
  async getService(serviceId: string): Promise<Service | undefined> {
    const config = await this.readConfig();
    return config.stack_profile.services?.find((s: any) => s.id === serviceId);
  }

  /**
   * Get all services
   */
  async getServices(): Promise<Service[]> {
    const config = await this.readConfig();
    return config.stack_profile.services || [];
  }

  async updateResourceState(
    resourceType: 'skills' | 'agents' | 'commands',
    resourceName: string,
    metadata: Partial<ResourceInfo>
  ): Promise<FrameworkConfig> {
    const config = await this.readConfig();

    if (!config.resource_state[resourceType]) {
      config.resource_state[resourceType] = {};
    }

    config.resource_state[resourceType][resourceName] = {
      ...config.resource_state[resourceType][resourceName],
      ...metadata,
      last_sync: new Date().toISOString(),
    };

    config.resource_state.last_sync = new Date().toISOString();

    await this.writeConfig(config);

    return config;
  }

  async removeResourceFromState(resourceType: 'skills' | 'agents' | 'commands', resourceName: string): Promise<boolean> {
    const config = await this.readConfig();

    if (config.resource_state[resourceType] && config.resource_state[resourceType][resourceName]) {
      delete config.resource_state[resourceType][resourceName];
      config.resource_state.last_sync = new Date().toISOString();
      await this.writeConfig(config);
      return true;
    }

    return false;
  }

  generateProjectHash(): string {
    const extensions = ['*.js', '*.ts', '*.py', '*.json', '*.md', '*.go', '*.java', '*.rs', '*.rb'];
    const excludes = [
      'node_modules',
      '.git',
      '.claude',
      '.claude-temp',
      '.claude-backups',
      'dist',
      'build',
      '__pycache__',
      'venv',
      'target',
    ];

    try {
      const findCmd = `find "${this.projectPath}" -type f \\( ${extensions.map((ext) => `-name "${ext}"`).join(' -o ')} \\) ${excludes.map((ex) => `-not -path "*/${ex}/*"`).join(' ')} | sort | xargs cat 2>/dev/null | sha256sum | cut -d' ' -f1`;

      const hash = execSync(findCmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }).trim();

      return hash;
    } catch (error) {
      console.warn('Warning: Could not generate project hash:', error instanceof Error ? error.message : String(error));
      return createHash('sha256').update(Math.random().toString()).digest('hex');
    }
  }

  async detectProjectChanges(): Promise<{
    changed: boolean;
    currentHash: string;
    storedHash?: string;
  }> {
    const config = await this.readConfig();
    const currentHash = this.generateProjectHash();
    const storedHash = config.project_metadata.initialization_hash;

    if (currentHash !== storedHash) {
      return {
        changed: true,
        currentHash,
        storedHash,
      };
    }

    return {
      changed: false,
      currentHash,
    };
  }

  async updateProjectMetadata(updates: Record<string, any>): Promise<FrameworkConfig> {
    const config = await this.readConfig();

    config.project_metadata = {
      ...config.project_metadata,
      ...updates,
    };

    if (updates.initialization_hash === undefined) {
      config.project_metadata.initialization_hash = this.generateProjectHash();
    }

    config.project_metadata.last_analysis = new Date().toISOString();

    await this.writeConfig(config);

    return config;
  }

  hashFile(filePath: string): string {
    if (!existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = readFileSync(filePath, 'utf-8');
    return createHash('sha256').update(content).digest('hex');
  }

  hashDirectory(dirPath: string): string {
    if (!existsSync(dirPath)) {
      throw new Error(`Directory not found: ${dirPath}`);
    }

    const files = this.getAllFiles(dirPath).sort();
    const combinedContent = files.map((file) => readFileSync(file, 'utf-8')).join('');

    return createHash('sha256').update(combinedContent).digest('hex');
  }

  getAllFiles(dirPath: string, arrayOfFiles: string[] = []): string[] {
    const files = readdirSync(dirPath);

    files.forEach((file) => {
      const filePath = join(dirPath, file);
      if (statSync(filePath).isDirectory()) {
        arrayOfFiles = this.getAllFiles(filePath, arrayOfFiles);
      } else {
        arrayOfFiles.push(filePath);
      }
    });

    return arrayOfFiles;
  }

  async detectUserModifications(): Promise<UserModifications> {
    const config = await this.readConfig();
    const modifications: UserModifications = {
      skills: [],
      agents: [],
    };

    Object.keys(config.resource_state.skills || {}).forEach((skillName) => {
      const skillInfo = config.resource_state.skills[skillName];

      if (!skillInfo.managed_by_framework) {
        return;
      }

      const skillPath = join(this.projectPath, '.claude', 'skills', skillName);

      if (existsSync(skillPath)) {
        const currentHash = this.hashDirectory(skillPath);

        if (skillInfo.file_hash && currentHash !== skillInfo.file_hash) {
          modifications.skills.push({
            name: skillName,
            path: skillPath,
            expectedHash: skillInfo.file_hash,
            currentHash,
          });
        }
      }
    });

    Object.keys(config.resource_state.agents || {}).forEach((agentName) => {
      const agentInfo = config.resource_state.agents[agentName];

      if (!agentInfo.managed_by_framework) {
        return;
      }

      const agentPath = join(this.projectPath, '.claude', 'agents', `${agentName}.md`);

      if (existsSync(agentPath)) {
        const currentHash = this.hashFile(agentPath);

        if (agentInfo.file_hash && currentHash !== agentInfo.file_hash) {
          modifications.agents.push({
            name: agentName,
            path: agentPath,
            expectedHash: agentInfo.file_hash,
            currentHash,
          });
        }
      }
    });

    return modifications;
  }

  async markResourceAsUserManaged(resourceType: 'skills' | 'agents', resourceName: string): Promise<boolean> {
    const config = await this.readConfig();

    if (config.resource_state[resourceType] && config.resource_state[resourceType][resourceName]) {
      config.resource_state[resourceType][resourceName].managed_by_framework = false;
      config.resource_state[resourceType][resourceName].user_modified = true;
      config.resource_state.last_sync = new Date().toISOString();

      await this.writeConfig(config);

      console.log(`Marked ${resourceType}/${resourceName} as user-managed (will skip future syncs)`);

      return true;
    }

    return false;
  }

  async updateFrameworkVersion(newVersion: string): Promise<{ oldVersion: string; newVersion: string }> {
    const config = await this.readConfig();
    const oldVersion = config.framework_version;

    config.framework_version = newVersion;

    await this.writeConfig(config);

    return {
      oldVersion,
      newVersion,
    };
  }

  async getFrameworkVersion(): Promise<string> {
    const packageJsonPath = join(this.frameworkPath, 'package.json');

    if (existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      return packageJson.version || '2.0.0';
    }

    return '2.0.0';
  }

  async isFrameworkUpdated(): Promise<VersionInfo> {
    const config = await this.readConfig();
    const currentFrameworkVersion = await this.getFrameworkVersion();
    const configFrameworkVersion = config.framework_version;

    return {
      updated: currentFrameworkVersion !== configFrameworkVersion,
      current: currentFrameworkVersion,
      configured: configFrameworkVersion,
    };
  }
}
