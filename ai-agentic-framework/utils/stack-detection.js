/**
 * Stack Detection Module
 *
 * Detects project tech stack by analyzing file patterns, dependencies, and configurations.
 *
 * @version 1.0.0
 * @author AI Framework Team
 */

const fs = require('fs');
const path = require('path');

/**
 * Detect workspaces in a monorepo
 * @param {string} projectPath - Absolute path to project root
 * @returns {Promise<string[]>} Array of workspace paths
 */
async function detectWorkspaces(projectPath) {
  const workspaces = [];

  // Check pnpm-workspace.yaml
  const pnpmWorkspace = path.join(projectPath, 'pnpm-workspace.yaml');
  if (fs.existsSync(pnpmWorkspace)) {
    try {
      const content = await fs.promises.readFile(pnpmWorkspace, 'utf8');
      // Simple YAML parsing for packages array
      const packagesMatch = content.match(/packages:\s*\n((?:\s+-\s+"[^"]+"\s*\n)+)/);
      if (packagesMatch) {
        const patterns = packagesMatch[1]
          .split('\n')
          .map(line => line.trim())
          .filter(line => line.startsWith('-'))
          .map(line => line.replace(/^-\s+"([^"]+)"/, '$1').trim());
        workspaces.push(...await expandGlobPatterns(projectPath, patterns));
      }
    } catch (error) {
      console.error('Error reading pnpm-workspace.yaml:', error.message);
    }
  }

  // Check package.json workspaces
  const packageJson = await readPackageJson(projectPath);
  if (packageJson?.workspaces && workspaces.length === 0) {
    const patterns = Array.isArray(packageJson.workspaces)
      ? packageJson.workspaces
      : packageJson.workspaces.packages || [];
    workspaces.push(...await expandGlobPatterns(projectPath, patterns));
  }

  // Check lerna.json
  if (workspaces.length === 0) {
    const lernaJson = path.join(projectPath, 'lerna.json');
    if (fs.existsSync(lernaJson)) {
      try {
        const lerna = JSON.parse(await fs.promises.readFile(lernaJson, 'utf8'));
        if (lerna.packages) {
          workspaces.push(...await expandGlobPatterns(projectPath, lerna.packages));
        }
      } catch (error) {
        console.error('Error reading lerna.json:', error.message);
      }
    }
  }

  // If no workspaces found, treat project as single workspace
  return workspaces.length > 0 ? workspaces : [projectPath];
}

/**
 * Expand glob patterns to actual directory paths
 * @param {string} basePath - Base path to search from
 * @param {string[]} patterns - Array of glob patterns
 * @returns {Promise<string[]>} Array of matched directory paths
 */
async function expandGlobPatterns(basePath, patterns) {
  const workspaces = [];

  for (const pattern of patterns) {
    // Simple glob expansion for common patterns like "packages/*" or "services/*"
    const wildcardMatch = pattern.match(/^([^*]+)\/\*$/);
    if (wildcardMatch) {
      const baseDir = path.join(basePath, wildcardMatch[1]);
      if (fs.existsSync(baseDir)) {
        try {
          const entries = await fs.promises.readdir(baseDir, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const fullPath = path.join(baseDir, entry.name);
              // Check if directory has package.json (indicates a workspace)
              if (fs.existsSync(path.join(fullPath, 'package.json'))) {
                workspaces.push(fullPath);
              }
            }
          }
        } catch (error) {
          console.error(`Error reading directory ${baseDir}:`, error.message);
        }
      }
    } else {
      // Handle exact paths (no wildcards)
      const exactPath = path.join(basePath, pattern);
      if (fs.existsSync(exactPath)) {
        const stats = await fs.promises.stat(exactPath);
        if (stats.isDirectory() && fs.existsSync(path.join(exactPath, 'package.json'))) {
          workspaces.push(exactPath);
        }
      }
    }
  }

  return workspaces;
}

/**
 * Main entry point for stack detection (with workspace support)
 * @param {string} projectPath - Absolute path to project root
 * @returns {Promise<Object>} Stack profile with detected technologies
 */
async function detectStack(projectPath) {
  try {
    // Detect workspaces
    const workspaces = await detectWorkspaces(projectPath);
    const isMonorepo = workspaces.length > 1;

    if (!isMonorepo) {
      // Single workspace - use existing logic
      return await detectStackForWorkspace(projectPath, {
        isMonorepo: false,
        workspaceName: 'root'
      });
    }

    // Multiple workspaces - detect each separately
    const workspaceProfiles = [];
    for (const workspace of workspaces) {
      const workspaceName = path.relative(projectPath, workspace) || 'root';
      const profile = await detectStackForWorkspace(workspace, {
        isMonorepo: true,
        workspaceName
      });
      workspaceProfiles.push(profile);
    }

    // Merge workspace profiles
    return mergeWorkspaceProfiles(workspaceProfiles, projectPath);
  } catch (error) {
    console.error('Stack detection error:', error.message);
    throw new Error(`Failed to detect stack: ${error.message}`);
  }
}

/**
 * Detect stack for a single workspace
 * @param {string} workspacePath - Absolute path to workspace
 * @param {Object} metadata - Workspace metadata (isMonorepo, workspaceName)
 * @returns {Promise<Object>} Stack profile for this workspace
 */
async function detectStackForWorkspace(workspacePath, metadata) {
  const profile = {
    languages: [],
    primary_language: null, // Kept for backward compatibility
    backend_frameworks: [],
    backend: null, // Kept for backward compatibility
    frontend_frameworks: [],
    frontend: null, // Kept for backward compatibility
    databases: [],
    testing: [],
    cloud: [],
    containers: [],
    package_manager: null,
    monorepo: metadata.isMonorepo,
    dependency_versions: {},
    detection_metadata: {
      timestamp: new Date().toISOString(),
      project_path: workspacePath,
      workspace_name: metadata.workspaceName,
      detection_log: []
    }
  };

  try {
    // 1. Detect all languages (supports polyglot repos)
    const { languages, detectionLog } = await detectLanguage(workspacePath);
    profile.languages = languages;
    profile.detection_metadata.detection_log.push(...detectionLog);

    // Set primary language for backward compatibility (first detected language)
    if (languages.length > 0) {
      profile.primary_language = languages[0].name;
    }

    // 2. Detect backend and frontend frameworks for each language
    for (const lang of languages) {
      const backendFrameworks = await detectBackendFramework(workspacePath, lang.name);
      const frontendFrameworks = await detectFrontendFramework(workspacePath, lang.name);

      profile.backend_frameworks.push(...backendFrameworks);
      profile.frontend_frameworks.push(...frontendFrameworks);

      // Log framework detection
      if (backendFrameworks.length > 0) {
        profile.detection_metadata.detection_log.push(
          `✓ Backend frameworks for ${lang.name}: ${backendFrameworks.map(f => `${f.name} ${f.version}`).join(', ')}`
        );
      }
      if (frontendFrameworks.length > 0) {
        profile.detection_metadata.detection_log.push(
          `✓ Frontend frameworks for ${lang.name}: ${frontendFrameworks.map(f => `${f.name} ${f.version}`).join(', ')}`
        );
      }
    }

    // Set backward compatibility fields (first detected framework)
    if (profile.backend_frameworks.length > 0) {
      profile.backend = {
        framework: profile.backend_frameworks[0].name,
        version: profile.backend_frameworks[0].version,
        confidence: profile.backend_frameworks[0].confidence,
        reason: profile.backend_frameworks[0].detectedBy
      };
    }
    if (profile.frontend_frameworks.length > 0) {
      profile.frontend = {
        framework: profile.frontend_frameworks[0].name,
        version: profile.frontend_frameworks[0].version,
        confidence: profile.frontend_frameworks[0].confidence,
        reason: profile.frontend_frameworks[0].detectedBy
      };
    }

    // 3. Extract all dependency versions
    for (const lang of languages) {
      const versions = await extractDependencyVersions(workspacePath, lang.name);
      Object.assign(profile.dependency_versions, versions);
    }

    // 4. Detect databases
    profile.databases = await detectDatabases(workspacePath);
    if (profile.databases.length > 0) {
      profile.detection_metadata.detection_log.push(
        `✓ Databases: ${profile.databases.map(db => db.name).join(', ')}`
      );
    }

    // 5. Detect testing frameworks
    if (languages.length > 0) {
      profile.testing = await detectTestingFrameworks(workspacePath, languages[0].name);
      if (profile.testing.length > 0) {
        profile.detection_metadata.detection_log.push(
          `✓ Testing: ${profile.testing.map(t => t.name).join(', ')}`
        );
      }
    }

    // 6. Detect cloud platforms
    profile.cloud = await detectCloudPlatforms(workspacePath);
    if (profile.cloud.length > 0) {
      profile.detection_metadata.detection_log.push(
        `✓ Cloud: ${profile.cloud.map(c => c.name).join(', ')}`
      );
    }

    // 7. Detect containerization
    profile.containers = await detectContainers(workspacePath);
    if (profile.containers.length > 0) {
      profile.detection_metadata.detection_log.push(
        `✓ Containers: ${profile.containers.map(c => c.name).join(', ')}`
      );
    }

    // 8. Detect package manager
    profile.package_manager = await detectPackageManager(workspacePath);
    if (profile.package_manager) {
      profile.detection_metadata.detection_log.push(`✓ Package manager: ${profile.package_manager}`);
    }

    return profile;
  } catch (error) {
    console.error(`Stack detection error for workspace ${metadata.workspaceName}:`, error.message);
    throw error;
  }
}

/**
 * Merge multiple workspace profiles into a single monorepo profile
 * @param {Object[]} profiles - Array of workspace profiles
 * @param {string} projectPath - Root project path
 * @returns {Object} Merged monorepo profile
 */
function mergeWorkspaceProfiles(profiles, projectPath) {
  // Helper to deduplicate objects by name
  const deduplicateByName = (items) => {
    const seen = new Map();
    for (const item of items) {
      if (!seen.has(item.name)) {
        seen.set(item.name, item);
      }
    }
    return Array.from(seen.values());
  };

  // Aggregate dependency versions from all workspaces
  const allDependencyVersions = {};
  for (const profile of profiles) {
    if (profile.dependency_versions) {
      Object.assign(allDependencyVersions, profile.dependency_versions);
    }
  }

  // Aggregate languages (keep full objects with confidence)
  const languages = deduplicateByName(profiles.flatMap(p => p.languages));
  // Aggregate frameworks (keep full objects with versions)
  const backendFrameworks = deduplicateByName(profiles.flatMap(p => p.backend_frameworks));
  const frontendFrameworks = deduplicateByName(profiles.flatMap(p => p.frontend_frameworks));

  return {
    project_path: projectPath,
    is_monorepo: true,
    workspaces: profiles.map(p => ({
      name: p.detection_metadata.workspace_name,
      path: p.detection_metadata.project_path,
      primary_language: p.primary_language,
      backend: p.backend,
      frontend: p.frontend,
      databases: p.databases,
      testing: p.testing,
      cloud: p.cloud,
      containers: p.containers,
      confidence: p.detection_metadata.confidence_scores
    })),
    // New array-based fields (P0-2, P0-4)
    languages: languages,
    backend_frameworks: backendFrameworks,
    frontend_frameworks: frontendFrameworks,
    dependency_versions: allDependencyVersions,
    // Backward compatibility fields
    primary_language: languages[0]?.name || null,
    backend: backendFrameworks[0] ? {
      framework: backendFrameworks[0].name,
      version: backendFrameworks[0].version,
      confidence: backendFrameworks[0].confidence,
      reason: backendFrameworks[0].detectedBy
    } : null,
    frontend: frontendFrameworks[0] ? {
      framework: frontendFrameworks[0].name,
      version: frontendFrameworks[0].version,
      confidence: frontendFrameworks[0].confidence,
      reason: frontendFrameworks[0].detectedBy
    } : null,
    // Union of all databases, testing frameworks
    databases: [...new Set(profiles.flatMap(p => p.databases?.map(db => db.name) || []))],
    testing_frameworks: [...new Set(profiles.flatMap(p => p.testing?.map(t => t.name) || []))],
    cloud_platforms: [...new Set(profiles.flatMap(p => p.cloud?.map(c => c.name) || []))],
    containers: [...new Set(profiles.flatMap(p => p.containers?.map(c => c.name) || []))],
    // Package manager (prefer from root, but use first available)
    package_manager: profiles.find(p => p.package_manager)?.package_manager || null,
    // Aggregate detection logs
    detection_metadata: {
      timestamp: new Date().toISOString(),
      project_path: projectPath,
      workspace_count: profiles.length,
      detection_logs: profiles.map(p => ({
        workspace: p.detection_metadata.workspace_name,
        log: p.detection_metadata.detection_log
      }))
    }
  };
}

/**
 * Detect all programming languages in the project (supports polyglot repos)
 */
async function detectLanguage(projectPath) {
  const languages = [];
  const detectionLog = [];

  // TypeScript - HIGH confidence
  if (await fileExists(projectPath, 'tsconfig.json')) {
    languages.push({
      name: 'typescript',
      confidence: 'high',
      detectedBy: 'tsconfig.json found',
      paths: [projectPath]
    });
    detectionLog.push('✓ TypeScript detected (tsconfig.json)');
  } else {
    // Check for TypeScript in dependencies
    const packageJson = await readPackageJson(projectPath);
    if (packageJson && (packageJson.dependencies?.typescript || packageJson.devDependencies?.typescript)) {
      languages.push({
        name: 'typescript',
        confidence: 'medium',
        detectedBy: 'TypeScript in dependencies',
        paths: [projectPath]
      });
      detectionLog.push('✓ TypeScript detected (dependencies)');
    }
  }

  // JavaScript - MEDIUM confidence (only if no TypeScript)
  const packageJson = await readPackageJson(projectPath);
  if (packageJson && !languages.find(l => l.name === 'typescript')) {
    languages.push({
      name: 'javascript',
      confidence: 'medium',
      detectedBy: 'package.json without TypeScript',
      paths: [projectPath]
    });
    detectionLog.push('✓ JavaScript detected (package.json)');
  }

  // Python - HIGH confidence
  if (await fileExists(projectPath, 'pyproject.toml')) {
    languages.push({
      name: 'python',
      confidence: 'high',
      detectedBy: 'pyproject.toml found',
      paths: [projectPath]
    });
    detectionLog.push('✓ Python detected (pyproject.toml)');
  } else if (await fileExists(projectPath, 'setup.py')) {
    languages.push({
      name: 'python',
      confidence: 'high',
      detectedBy: 'setup.py found',
      paths: [projectPath]
    });
    detectionLog.push('✓ Python detected (setup.py)');
  } else if (await fileExists(projectPath, 'requirements.txt')) {
    languages.push({
      name: 'python',
      confidence: 'medium',
      detectedBy: 'requirements.txt found',
      paths: [projectPath]
    });
    detectionLog.push('✓ Python detected (requirements.txt)');
  } else if (await fileExists(projectPath, 'Pipfile')) {
    languages.push({
      name: 'python',
      confidence: 'high',
      detectedBy: 'Pipfile found',
      paths: [projectPath]
    });
    detectionLog.push('✓ Python detected (Pipfile)');
  }

  // Java - HIGH confidence
  if (await fileExists(projectPath, 'pom.xml')) {
    languages.push({
      name: 'java',
      confidence: 'high',
      detectedBy: 'pom.xml found (Maven)',
      paths: [projectPath]
    });
    detectionLog.push('✓ Java detected (pom.xml)');
  } else if (await fileExists(projectPath, 'build.gradle') || await fileExists(projectPath, 'build.gradle.kts')) {
    languages.push({
      name: 'java',
      confidence: 'high',
      detectedBy: 'build.gradle found (Gradle)',
      paths: [projectPath]
    });
    detectionLog.push('✓ Java detected (build.gradle)');
  }

  // Go - HIGH confidence
  if (await fileExists(projectPath, 'go.mod')) {
    languages.push({
      name: 'go',
      confidence: 'high',
      detectedBy: 'go.mod found',
      paths: [projectPath]
    });
    detectionLog.push('✓ Go detected (go.mod)');
  }

  // Ruby - HIGH confidence
  if (await fileExists(projectPath, 'Gemfile')) {
    languages.push({
      name: 'ruby',
      confidence: 'high',
      detectedBy: 'Gemfile found',
      paths: [projectPath]
    });
    detectionLog.push('✓ Ruby detected (Gemfile)');
  }

  // PHP - HIGH confidence
  if (await fileExists(projectPath, 'composer.json')) {
    languages.push({
      name: 'php',
      confidence: 'high',
      detectedBy: 'composer.json found',
      paths: [projectPath]
    });
    detectionLog.push('✓ PHP detected (composer.json)');
  }

  if (languages.length === 0) {
    detectionLog.push('✗ No languages detected');
  }

  return { languages, detectionLog };
}

/**
 * Extract dependency versions from package manager files
 * @param {string} projectPath - Path to project
 * @param {string} language - Programming language
 * @returns {Promise<Object>} Map of dependency names to versions
 */
async function extractDependencyVersions(projectPath, language) {
  const versions = {};

  if (language === 'typescript' || language === 'javascript') {
    const packageJsonPath = path.join(projectPath, 'package.json');
    if (await fileExists(projectPath, 'package.json')) {
      const pkg = await readPackageJson(projectPath);
      if (pkg) {
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

        for (const [name, versionRange] of Object.entries(allDeps)) {
          // Extract semver version (strip ^, ~, >=, etc.)
          const match = versionRange.match(/(\d+\.\d+\.\d+)/);
          if (match) {
            versions[name] = match[1];
          } else {
            // Store the raw version if no semver match (e.g., "latest", "workspace:*")
            versions[name] = versionRange;
          }
        }
      }
    }
  } else if (language === 'python') {
    const pyprojectPath = path.join(projectPath, 'pyproject.toml');
    if (await fileExists(projectPath, 'pyproject.toml')) {
      const content = await readFile(projectPath, 'pyproject.toml');
      if (content) {
        // Parse dependencies from pyproject.toml
        // Format: package = "^1.0.0" or package = { version = "^1.0.0" }
        const depMatches = content.match(/([a-zA-Z0-9_-]+)\s*=\s*["{].*?(\d+\.\d+\.\d+)/g);
        if (depMatches) {
          for (const match of depMatches) {
            const parts = match.match(/([a-zA-Z0-9_-]+)\s*=\s*["{].*?(\d+\.\d+\.\d+)/);
            if (parts && parts[1] && parts[2]) {
              versions[parts[1]] = parts[2];
            }
          }
        }
      }
    }

    // Also check requirements.txt
    const requirementsPath = path.join(projectPath, 'requirements.txt');
    if (await fileExists(projectPath, 'requirements.txt')) {
      const content = await readFile(projectPath, 'requirements.txt');
      if (content) {
        const lines = content.split('\n');
        for (const line of lines) {
          // Parse "package==1.0.0" or "package>=1.0.0"
          const match = line.trim().match(/^([a-zA-Z0-9_-]+)[>=<~!]*(\d+\.\d+\.\d+)/);
          if (match && match[1] && match[2]) {
            // Don't overwrite if already found in pyproject.toml
            if (!versions[match[1]]) {
              versions[match[1]] = match[2];
            }
          }
        }
      }
    }
  } else if (language === 'java') {
    // Parse pom.xml for Maven dependencies
    const pomXml = await readFile(projectPath, 'pom.xml');
    if (pomXml) {
      const depMatches = pomXml.match(/<dependency>[\s\S]*?<groupId>(.*?)<\/groupId>[\s\S]*?<artifactId>(.*?)<\/artifactId>[\s\S]*?<version>(.*?)<\/version>[\s\S]*?<\/dependency>/g);
      if (depMatches) {
        for (const match of depMatches) {
          const groupId = match.match(/<groupId>(.*?)<\/groupId>/)?.[1];
          const artifactId = match.match(/<artifactId>(.*?)<\/artifactId>/)?.[1];
          const version = match.match(/<version>(.*?)<\/version>/)?.[1];
          if (groupId && artifactId && version) {
            versions[`${groupId}:${artifactId}`] = version;
          }
        }
      }
    }
  }

  return versions;
}

/**
 * Detect backend frameworks based on language (returns array to support multiple frameworks)
 */
async function detectBackendFramework(projectPath, language) {
  const frameworks = [];
  const versions = await extractDependencyVersions(projectPath, language);

  if (language === 'typescript' || language === 'javascript') {
    // NestJS
    if (versions['@nestjs/core']) {
      frameworks.push({
        name: 'nestjs',
        version: versions['@nestjs/core'],
        confidence: 'high',
        detectedBy: '@nestjs/core dependency'
      });
    }

    // Fastify
    if (versions['fastify']) {
      frameworks.push({
        name: 'fastify',
        version: versions['fastify'],
        confidence: 'high',
        detectedBy: 'fastify dependency'
      });
    }

    // Express
    if (versions['express']) {
      frameworks.push({
        name: 'express',
        version: versions['express'],
        confidence: 'medium',
        detectedBy: 'express dependency'
      });
    }

    // Koa
    if (versions['koa']) {
      frameworks.push({
        name: 'koa',
        version: versions['koa'],
        confidence: 'medium',
        detectedBy: 'koa dependency'
      });
    }

    // Hapi
    if (versions['@hapi/hapi']) {
      frameworks.push({
        name: 'hapi',
        version: versions['@hapi/hapi'],
        confidence: 'high',
        detectedBy: '@hapi/hapi dependency'
      });
    }
  }

  if (language === 'python') {
    const deps = await readPythonDependencies(projectPath);

    // FastAPI
    if (deps.includes('fastapi')) {
      frameworks.push({
        name: 'fastapi',
        version: versions['fastapi'] || 'unknown',
        confidence: 'high',
        detectedBy: 'fastapi in dependencies'
      });
    }

    // Django
    if (deps.includes('django')) {
      const hasMangePy = await fileExists(projectPath, 'manage.py');
      frameworks.push({
        name: 'django',
        version: versions['django'] || 'unknown',
        confidence: hasMangePy ? 'high' : 'medium',
        detectedBy: hasMangePy ? 'django + manage.py found' : 'django in dependencies'
      });
    }

    // Flask
    if (deps.includes('flask')) {
      frameworks.push({
        name: 'flask',
        version: versions['flask'] || 'unknown',
        confidence: 'high',
        detectedBy: 'flask in dependencies'
      });
    }
  }

  if (language === 'java') {
    const pomXml = await readFile(projectPath, 'pom.xml');
    if (pomXml && pomXml.includes('org.springframework.boot')) {
      const versionMatch = pomXml.match(/org\.springframework\.boot[\s\S]*?<version>(.*?)<\/version>/);
      frameworks.push({
        name: 'spring-boot',
        version: versionMatch ? versionMatch[1] : versions['org.springframework.boot:spring-boot-starter'] || 'unknown',
        confidence: 'high',
        detectedBy: 'Spring Boot in pom.xml'
      });
    }

    const buildGradle = await readFile(projectPath, 'build.gradle');
    if (buildGradle && buildGradle.includes('org.springframework.boot')) {
      const versionMatch = buildGradle.match(/org\.springframework\.boot['":].*?['":]\s*(\d+\.\d+\.\d+)/);
      frameworks.push({
        name: 'spring-boot',
        version: versionMatch ? versionMatch[1] : 'unknown',
        confidence: 'high',
        detectedBy: 'Spring Boot in build.gradle'
      });
    }
  }

  return frameworks;
}

/**
 * Detect frontend frameworks (returns array to support multiple frameworks)
 */
async function detectFrontendFramework(projectPath, language) {
  const frameworks = [];

  if (language !== 'typescript' && language !== 'javascript') {
    return frameworks;
  }

  const packageJson = await readPackageJson(projectPath);
  if (!packageJson) return frameworks;

  const versions = await extractDependencyVersions(projectPath, language);

  // Next.js (implies React)
  if (packageJson.dependencies?.next) {
    const hasConfig = await fileExists(projectPath, 'next.config.js') ||
                     await fileExists(projectPath, 'next.config.ts') ||
                     await fileExists(projectPath, 'next.config.mjs');
    frameworks.push({
      name: 'nextjs',
      version: versions['next'] || 'unknown',
      confidence: hasConfig ? 'high' : 'medium',
      detectedBy: hasConfig ? 'next in dependencies + config found' : 'next in dependencies'
    });
  }

  // React
  if (packageJson.dependencies?.react) {
    frameworks.push({
      name: 'react',
      version: versions['react'] || 'unknown',
      confidence: 'high',
      detectedBy: 'react in dependencies'
    });
  }

  // Vue
  if (packageJson.dependencies?.vue) {
    frameworks.push({
      name: 'vue',
      version: versions['vue'] || 'unknown',
      confidence: 'high',
      detectedBy: 'vue in dependencies'
    });
  }

  // Angular
  if (packageJson.dependencies?.['@angular/core']) {
    frameworks.push({
      name: 'angular',
      version: versions['@angular/core'] || 'unknown',
      confidence: 'high',
      detectedBy: '@angular/core in dependencies'
    });
  }

  // Svelte
  if (packageJson.dependencies?.svelte) {
    frameworks.push({
      name: 'svelte',
      version: versions['svelte'] || 'unknown',
      confidence: 'high',
      detectedBy: 'svelte in dependencies'
    });
  }

  // Solid
  if (packageJson.dependencies?.['solid-js']) {
    frameworks.push({
      name: 'solid',
      version: versions['solid-js'] || 'unknown',
      confidence: 'high',
      detectedBy: 'solid-js in dependencies'
    });
  }

  // Preact
  if (packageJson.dependencies?.preact) {
    frameworks.push({
      name: 'preact',
      version: versions['preact'] || 'unknown',
      confidence: 'high',
      detectedBy: 'preact in dependencies'
    });
  }

  return frameworks;
}

/**
 * Detect databases
 */
async function detectDatabases(projectPath) {
  const databases = [];

  // Check package.json dependencies
  const packageJson = await readPackageJson(projectPath);
  if (packageJson) {
    const allDeps = { ...packageJson.dependencies, ...packageJson.devDependencies };

    if (allDeps.pg || allDeps.postgres || allDeps.typeorm) {
      databases.push({ name: 'postgresql', confidence: 'high', reason: 'PostgreSQL driver in dependencies' });
    }

    if (allDeps.mysql || allDeps.mysql2) {
      databases.push({ name: 'mysql', confidence: 'high', reason: 'MySQL driver in dependencies' });
    }

    if (allDeps.mongodb || allDeps.mongoose) {
      databases.push({ name: 'mongodb', confidence: 'high', reason: 'MongoDB driver in dependencies' });
    }

    if (allDeps.redis || allDeps.ioredis) {
      databases.push({ name: 'redis', confidence: 'high', reason: 'Redis client in dependencies' });
    }

    if (allDeps['@google-cloud/firestore'] || allDeps['firebase-admin']) {
      databases.push({ name: 'firestore', confidence: 'high', reason: 'Firestore client in dependencies' });
    }

    if (allDeps.sqlite3 || allDeps['better-sqlite3']) {
      databases.push({ name: 'sqlite', confidence: 'medium', reason: 'SQLite client in dependencies' });
    }
  }

  // Check docker-compose.yml
  const dockerCompose = await readDockerCompose(projectPath);
  if (dockerCompose) {
    if (dockerCompose.includes('image: postgres')) {
      if (!databases.find(db => db.name === 'postgresql')) {
        databases.push({ name: 'postgresql', confidence: 'high', reason: 'postgres in docker-compose.yml' });
      }
    }

    if (dockerCompose.includes('image: mysql')) {
      if (!databases.find(db => db.name === 'mysql')) {
        databases.push({ name: 'mysql', confidence: 'high', reason: 'mysql in docker-compose.yml' });
      }
    }

    if (dockerCompose.includes('image: mongo')) {
      if (!databases.find(db => db.name === 'mongodb')) {
        databases.push({ name: 'mongodb', confidence: 'high', reason: 'mongo in docker-compose.yml' });
      }
    }

    if (dockerCompose.includes('image: redis')) {
      if (!databases.find(db => db.name === 'redis')) {
        databases.push({ name: 'redis', confidence: 'high', reason: 'redis in docker-compose.yml' });
      }
    }
  }

  return databases;
}

/**
 * Detect testing frameworks
 */
async function detectTestingFrameworks(projectPath, language) {
  const frameworks = [];

  if (language === 'typescript' || language === 'javascript') {
    const packageJson = await readPackageJson(projectPath);
    if (packageJson?.devDependencies) {
      // Jest
      if (packageJson.devDependencies.jest) {
        frameworks.push({ name: 'jest', type: 'unit', confidence: 'high', reason: 'jest in devDependencies' });
      }

      // Vitest
      if (packageJson.devDependencies.vitest) {
        frameworks.push({ name: 'vitest', type: 'unit', confidence: 'high', reason: 'vitest in devDependencies' });
      }

      // Playwright
      if (packageJson.devDependencies['@playwright/test']) {
        frameworks.push({ name: 'playwright', type: 'e2e', confidence: 'high', reason: '@playwright/test in devDependencies' });
      }

      // Cypress
      if (packageJson.devDependencies.cypress) {
        frameworks.push({ name: 'cypress', type: 'e2e', confidence: 'high', reason: 'cypress in devDependencies' });
      }
    }
  }

  if (language === 'python') {
    const deps = await readPythonDependencies(projectPath);

    // Pytest
    if (deps.includes('pytest')) {
      frameworks.push({ name: 'pytest', type: 'unit', confidence: 'high', reason: 'pytest in dependencies' });
    } else {
      // Unittest (built-in, check for test files)
      frameworks.push({ name: 'unittest', type: 'unit', confidence: 'medium', reason: 'Python built-in (fallback)' });
    }
  }

  return frameworks;
}

/**
 * Detect if project has an E2E testing framework installed
 * @param {string} projectPath - Path to project root
 * @returns {Promise<Object>} E2E framework detection result
 *   {
 *     hasFramework: boolean,
 *     framework: string|null,
 *     configFile: string|null,
 *     confidence: string|null,
 *     detectedBy: string|null
 *   }
 */
async function hasE2EFramework(projectPath) {
  const result = {
    hasFramework: false,
    framework: null,
    configFile: null,
    confidence: null,
    detectedBy: null
  };

  // E2E framework config file mappings
  const e2eFrameworks = [
    {
      name: 'playwright',
      dependency: '@playwright/test',
      configFiles: ['playwright.config.js', 'playwright.config.ts', 'playwright.config.mjs']
    },
    {
      name: 'cypress',
      dependency: 'cypress',
      configFiles: ['cypress.config.js', 'cypress.config.ts', 'cypress.json']
    },
    {
      name: 'testcafe',
      dependency: 'testcafe',
      configFiles: ['.testcaferc.js', '.testcaferc.json', 'testcafe.config.js']
    },
    {
      name: 'webdriverio',
      dependency: 'webdriverio',
      configFiles: ['wdio.conf.js', 'wdio.conf.ts']
    },
    {
      name: 'puppeteer',
      dependency: 'puppeteer',
      configFiles: ['jest-puppeteer.config.js', 'puppeteer.config.js']
    }
  ];

  const packageJson = await readPackageJson(projectPath);
  if (!packageJson) {
    return result;
  }

  const allDeps = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies
  };

  // Check each E2E framework
  for (const framework of e2eFrameworks) {
    // Check if dependency exists
    if (allDeps[framework.dependency]) {
      // Check for config file
      for (const configFile of framework.configFiles) {
        if (await fileExists(projectPath, configFile)) {
          result.hasFramework = true;
          result.framework = framework.name;
          result.configFile = configFile;
          result.confidence = 'high';
          result.detectedBy = `${framework.dependency} in dependencies + ${configFile} found`;
          return result;
        }
      }

      // Dependency exists but no config file found
      result.hasFramework = true;
      result.framework = framework.name;
      result.configFile = null;
      result.confidence = 'medium';
      result.detectedBy = `${framework.dependency} in dependencies (no config file)`;
      return result;
    }
  }

  return result;
}

/**
 * Detect cloud platforms
 */
async function detectCloudPlatforms(projectPath) {
  const platforms = [];

  // AWS CDK
  if (await fileExists(projectPath, 'cdk.json')) {
    platforms.push({ name: 'aws-cdk', confidence: 'high', reason: 'cdk.json found' });
    platforms.push({ name: 'aws', confidence: 'high', reason: 'AWS CDK implies AWS' });
  }

  // AWS SDK
  const packageJson = await readPackageJson(projectPath);
  if (packageJson) {
    if (packageJson.dependencies?.['aws-sdk'] || Object.keys(packageJson.dependencies || {}).some(dep => dep.startsWith('@aws-sdk/'))) {
      if (!platforms.find(p => p.name === 'aws')) {
        platforms.push({ name: 'aws', confidence: 'high', reason: 'AWS SDK in dependencies' });
      }
    }
  }

  // GCP
  if (await fileExists(projectPath, '.gcloudignore') || await fileExists(projectPath, 'app.yaml')) {
    platforms.push({ name: 'gcp', confidence: 'high', reason: 'GCP config files found' });
  }

  if (packageJson) {
    if (Object.keys(packageJson.dependencies || {}).some(dep => dep.startsWith('@google-cloud/'))) {
      if (!platforms.find(p => p.name === 'gcp')) {
        platforms.push({ name: 'gcp', confidence: 'high', reason: '@google-cloud/* in dependencies' });
      }
    }
  }

  // Firebase
  if (await fileExists(projectPath, 'firebase.json')) {
    platforms.push({ name: 'firebase', confidence: 'high', reason: 'firebase.json found' });
  }

  // Vercel
  if (await fileExists(projectPath, 'vercel.json')) {
    platforms.push({ name: 'vercel', confidence: 'high', reason: 'vercel.json found' });
  }

  // Netlify
  if (await fileExists(projectPath, 'netlify.toml')) {
    platforms.push({ name: 'netlify', confidence: 'high', reason: 'netlify.toml found' });
  }

  return platforms;
}

/**
 * Detect containerization tools
 */
async function detectContainers(projectPath) {
  const containers = [];

  if (await fileExists(projectPath, 'Dockerfile')) {
    containers.push({ name: 'docker', confidence: 'high', reason: 'Dockerfile found' });
  }

  if (await fileExists(projectPath, 'docker-compose.yml') ||
      await fileExists(projectPath, 'docker-compose.yaml') ||
      await fileExists(projectPath, 'compose.yml')) {
    containers.push({ name: 'docker-compose', confidence: 'high', reason: 'docker-compose file found' });
    if (!containers.find(c => c.name === 'docker')) {
      containers.push({ name: 'docker', confidence: 'high', reason: 'implied by docker-compose' });
    }
  }

  // Kubernetes
  if (await directoryExists(projectPath, 'k8s') || await directoryExists(projectPath, 'kubernetes')) {
    containers.push({ name: 'kubernetes', confidence: 'high', reason: 'k8s directory found' });
  }

  return containers;
}

/**
 * Detect package manager
 */
async function detectPackageManager(projectPath) {
  if (await fileExists(projectPath, 'pnpm-lock.yaml')) {
    return 'pnpm';
  }
  if (await fileExists(projectPath, 'yarn.lock')) {
    return 'yarn';
  }
  if (await fileExists(projectPath, 'package-lock.json')) {
    return 'npm';
  }
  if (await fileExists(projectPath, 'bun.lockb')) {
    return 'bun';
  }
  return null;
}

/**
 * Detect monorepo
 */
async function detectMonorepo(projectPath) {
  // Check for workspace configuration
  if (await fileExists(projectPath, 'pnpm-workspace.yaml')) {
    return true;
  }

  if (await fileExists(projectPath, 'lerna.json')) {
    return true;
  }

  if (await fileExists(projectPath, 'nx.json')) {
    return true;
  }

  const packageJson = await readPackageJson(projectPath);
  if (packageJson?.workspaces) {
    return true;
  }

  // Check for common monorepo directory structures
  const hasPackages = await directoryExists(projectPath, 'packages');
  const hasServices = await directoryExists(projectPath, 'services');
  const hasApps = await directoryExists(projectPath, 'apps');

  return hasPackages || hasServices || hasApps;
}

// ============================================================================
// File System Utilities
// ============================================================================

async function fileExists(projectPath, filename) {
  try {
    await fs.promises.access(path.join(projectPath, filename));
    return true;
  } catch {
    return false;
  }
}

async function directoryExists(projectPath, dirname) {
  try {
    const stats = await fs.promises.stat(path.join(projectPath, dirname));
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function readFile(projectPath, filename) {
  try {
    return await fs.promises.readFile(path.join(projectPath, filename), 'utf8');
  } catch {
    return null;
  }
}

async function readPackageJson(projectPath) {
  const content = await readFile(projectPath, 'package.json');
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function readPythonDependencies(projectPath) {
  const deps = [];

  // Check pyproject.toml
  const pyproject = await readFile(projectPath, 'pyproject.toml');
  if (pyproject) {
    const depMatches = pyproject.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
    if (depMatches) {
      const depList = depMatches[1].match(/"([^"]+)"/g);
      if (depList) {
        deps.push(...depList.map(d => d.replace(/"/g, '').split(/[>=<]/)[0].toLowerCase()));
      }
    }
  }

  // Check requirements.txt
  const requirements = await readFile(projectPath, 'requirements.txt');
  if (requirements) {
    const lines = requirements.split('\n');
    for (const line of lines) {
      const match = line.trim().match(/^([a-zA-Z0-9_-]+)/);
      if (match) {
        deps.push(match[1].toLowerCase());
      }
    }
  }

  return deps;
}

async function readDockerCompose(projectPath) {
  return await readFile(projectPath, 'docker-compose.yml') ||
         await readFile(projectPath, 'docker-compose.yaml') ||
         await readFile(projectPath, 'compose.yml');
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  detectStack,
  detectWorkspaces,
  expandGlobPatterns,
  detectStackForWorkspace,
  mergeWorkspaceProfiles,
  detectLanguage,
  extractDependencyVersions,
  detectBackendFramework,
  detectFrontendFramework,
  detectDatabases,
  detectTestingFrameworks,
  hasE2EFramework,
  detectCloudPlatforms,
  detectContainers,
  detectPackageManager,
  detectMonorepo
};

// ============================================================================
// CLI Usage (if run directly)
// ============================================================================

if (require.main === module) {
  const projectPath = process.argv[2] || process.cwd();

  console.log(`Detecting stack for: ${projectPath}\n`);

  detectStack(projectPath)
    .then(profile => {
      console.log(JSON.stringify(profile, null, 2));
    })
    .catch(error => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}
