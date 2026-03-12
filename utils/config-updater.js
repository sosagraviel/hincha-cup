const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

class ConfigUpdater {
  constructor(projectPath, frameworkPath) {
    this.projectPath = projectPath;
    this.frameworkPath = frameworkPath;
    this.configPath = path.join(projectPath, '.claude', 'framework-config.json');
  }

  async readConfig() {
    if (!fs.existsSync(this.configPath)) {
      throw new Error(`Configuration file not found: ${this.configPath}`);
    }

    const configContent = fs.readFileSync(this.configPath, 'utf-8');
    return JSON.parse(configContent);
  }

  async writeConfig(config) {
    const dir = path.dirname(this.configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
  }

  async validateConfig(config) {
    const schema = require('../schemas/framework-config.schema.json');
    const Ajv = require('ajv');
    const ajv = new Ajv({ allErrors: true });

    const validate = ajv.compile(schema);
    const valid = validate(config);

    if (!valid) {
      return {
        valid: false,
        errors: validate.errors
      };
    }

    return { valid: true };
  }

  async updateStackProfile(newStackInfo) {
    const config = await this.readConfig();

    let updated = false;

    if (newStackInfo.languages && newStackInfo.languages.length > 0) {
      const existingLanguages = new Set(config.stack_profile.languages || []);
      const newLanguages = newStackInfo.languages.filter(lang => !existingLanguages.has(lang));

      if (newLanguages.length > 0) {
        config.stack_profile.languages = [
          ...(config.stack_profile.languages || []),
          ...newLanguages
        ];
        updated = true;
        console.log(`Added new languages: ${newLanguages.join(', ')}`);
      }
    }

    if (newStackInfo.frameworks) {
      ['frontend', 'backend', 'mobile'].forEach(category => {
        if (newStackInfo.frameworks[category] && newStackInfo.frameworks[category].length > 0) {
          const existing = new Set(config.stack_profile.frameworks[category] || []);
          const newFrameworks = newStackInfo.frameworks[category].filter(fw => !existing.has(fw));

          if (newFrameworks.length > 0) {
            config.stack_profile.frameworks[category] = [
              ...(config.stack_profile.frameworks[category] || []),
              ...newFrameworks
            ];
            updated = true;
            console.log(`Added new ${category} frameworks: ${newFrameworks.join(', ')}`);
          }
        }
      });
    }

    if (newStackInfo.testing_frameworks) {
      Object.keys(newStackInfo.testing_frameworks).forEach(language => {
        const existing = new Set(config.stack_profile.testing_frameworks[language] || []);
        const newFrameworks = newStackInfo.testing_frameworks[language].filter(fw => !existing.has(fw));

        if (newFrameworks.length > 0) {
          config.stack_profile.testing_frameworks[language] = [
            ...(config.stack_profile.testing_frameworks[language] || []),
            ...newFrameworks
          ];
          updated = true;
          console.log(`Added new testing frameworks for ${language}: ${newFrameworks.join(', ')}`);
        }
      });
    }

    if (updated) {
      await this.writeConfig(config);
      return { updated: true, config };
    }

    return { updated: false };
  }

  async updateResourceState(resourceType, resourceName, metadata) {
    const config = await this.readConfig();

    if (!config.resource_state[resourceType]) {
      config.resource_state[resourceType] = {};
    }

    config.resource_state[resourceType][resourceName] = {
      ...config.resource_state[resourceType][resourceName],
      ...metadata,
      last_sync: new Date().toISOString()
    };

    config.resource_state.last_sync = new Date().toISOString();

    await this.writeConfig(config);

    return config;
  }

  async removeResourceFromState(resourceType, resourceName) {
    const config = await this.readConfig();

    if (config.resource_state[resourceType] && config.resource_state[resourceType][resourceName]) {
      delete config.resource_state[resourceType][resourceName];
      config.resource_state.last_sync = new Date().toISOString();
      await this.writeConfig(config);
      return true;
    }

    return false;
  }

  generateProjectHash() {
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
      'target'
    ];

    try {
      const findCmd = `find "${this.projectPath}" -type f \\( ${extensions.map(ext => `-name "${ext}"`).join(' -o ')} \\) ${excludes.map(ex => `-not -path "*/${ex}/*"`).join(' ')} | sort | xargs cat 2>/dev/null | sha256sum | cut -d' ' -f1`;

      const hash = execSync(findCmd, { encoding: 'utf8', maxBuffer: 50 * 1024 * 1024 }).trim();

      return hash;
    } catch (error) {
      console.warn('Warning: Could not generate project hash:', error.message);
      return crypto.randomBytes(32).toString('hex');
    }
  }

  async detectProjectChanges() {
    const config = await this.readConfig();
    const currentHash = this.generateProjectHash();
    const storedHash = config.project_metadata.initialization_hash;

    if (currentHash !== storedHash) {
      return {
        changed: true,
        currentHash,
        storedHash
      };
    }

    return {
      changed: false,
      currentHash
    };
  }

  async updateProjectMetadata(updates) {
    const config = await this.readConfig();

    config.project_metadata = {
      ...config.project_metadata,
      ...updates
    };

    if (updates.initialization_hash === undefined) {
      config.project_metadata.initialization_hash = this.generateProjectHash();
    }

    config.project_metadata.last_analysis = new Date().toISOString();

    await this.writeConfig(config);

    return config;
  }

  hashFile(filePath) {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  hashDirectory(dirPath) {
    if (!fs.existsSync(dirPath)) {
      throw new Error(`Directory not found: ${dirPath}`);
    }

    const files = this.getAllFiles(dirPath).sort();
    const combinedContent = files.map(file => fs.readFileSync(file, 'utf-8')).join('');

    return crypto.createHash('sha256').update(combinedContent).digest('hex');
  }

  getAllFiles(dirPath, arrayOfFiles = []) {
    const files = fs.readdirSync(dirPath);

    files.forEach(file => {
      const filePath = path.join(dirPath, file);
      if (fs.statSync(filePath).isDirectory()) {
        arrayOfFiles = this.getAllFiles(filePath, arrayOfFiles);
      } else {
        arrayOfFiles.push(filePath);
      }
    });

    return arrayOfFiles;
  }

  async detectUserModifications() {
    const config = await this.readConfig();
    const modifications = {
      skills: [],
      agents: []
    };

    Object.keys(config.resource_state.skills || {}).forEach(skillName => {
      const skillInfo = config.resource_state.skills[skillName];

      if (!skillInfo.managed_by_framework) {
        return;
      }

      const skillPath = path.join(this.projectPath, '.claude', 'skills', skillName);

      if (fs.existsSync(skillPath)) {
        const currentHash = this.hashDirectory(skillPath);

        if (skillInfo.file_hash && currentHash !== skillInfo.file_hash) {
          modifications.skills.push({
            name: skillName,
            path: skillPath,
            expectedHash: skillInfo.file_hash,
            currentHash
          });
        }
      }
    });

    Object.keys(config.resource_state.agents || {}).forEach(agentName => {
      const agentInfo = config.resource_state.agents[agentName];

      if (!agentInfo.managed_by_framework) {
        return;
      }

      const agentPath = path.join(this.projectPath, '.claude', 'agents', `${agentName}.md`);

      if (fs.existsSync(agentPath)) {
        const currentHash = this.hashFile(agentPath);

        if (agentInfo.file_hash && currentHash !== agentInfo.file_hash) {
          modifications.agents.push({
            name: agentName,
            path: agentPath,
            expectedHash: agentInfo.file_hash,
            currentHash
          });
        }
      }
    });

    return modifications;
  }

  async markResourceAsUserManaged(resourceType, resourceName) {
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

  async updateFrameworkVersion(newVersion) {
    const config = await this.readConfig();
    const oldVersion = config.framework_version;

    config.framework_version = newVersion;

    await this.writeConfig(config);

    return {
      oldVersion,
      newVersion
    };
  }

  async getFrameworkVersion() {
    const packageJsonPath = path.join(this.frameworkPath, 'package.json');

    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
      return packageJson.version || '2.0.0';
    }

    return '2.0.0';
  }

  async isFrameworkUpdated() {
    const config = await this.readConfig();
    const currentFrameworkVersion = await this.getFrameworkVersion();
    const configFrameworkVersion = config.framework_version;

    return {
      updated: currentFrameworkVersion !== configFrameworkVersion,
      current: currentFrameworkVersion,
      configured: configFrameworkVersion
    };
  }
}

module.exports = { ConfigUpdater };
