/**
 * Stack Detection - Simple Config Reader
 *
 * Reads stack from framework-config.json (created by initialize-project agents).
 * No parsing, no regex, no complexity. Just read what AI agents already detected.
 *
 * Returns flat array: ['typescript', 'react', 'jest', 'aws', ...]
 */

const fs = require('fs');
const path = require('path');

/**
 * Read framework-config.json from project
 */
function readFrameworkConfig(projectPath) {
  const configPath = path.join(projectPath, '.claude', 'framework-config.json');

  if (!fs.existsSync(configPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`Failed to read framework config: ${error.message}`);
    return null;
  }
}

/**
 * Convert stack_profile object to flat array
 */
function stackProfileToArray(stackProfile) {
  if (!stackProfile) return [];

  const detected = new Set();

  // Languages
  if (stackProfile.languages && Array.isArray(stackProfile.languages)) {
    stackProfile.languages.forEach(lang => {
      const langName = typeof lang === 'object' ? lang.name : lang;
      if (langName) detected.add(langName);
    });
  }

  // Primary language (if not in languages array)
  if (stackProfile.primary_language && !detected.has(stackProfile.primary_language)) {
    detected.add(stackProfile.primary_language);
  }

  // Frameworks
  if (stackProfile.frameworks) {
    if (Array.isArray(stackProfile.frameworks.frontend)) {
      stackProfile.frameworks.frontend.forEach(f => detected.add(f));
    }
    if (Array.isArray(stackProfile.frameworks.backend)) {
      stackProfile.frameworks.backend.forEach(f => detected.add(f));
    }
    if (Array.isArray(stackProfile.frameworks.mobile)) {
      stackProfile.frameworks.mobile.forEach(f => detected.add(f));
    }
  }

  // Testing
  if (stackProfile.testing && Array.isArray(stackProfile.testing)) {
    stackProfile.testing.forEach(test => {
      const testName = typeof test === 'object' ? test.name : test;
      if (testName) detected.add(testName);
    });
  }

  // Testing frameworks (alternative format)
  if (stackProfile.testing_frameworks && typeof stackProfile.testing_frameworks === 'object') {
    Object.values(stackProfile.testing_frameworks).forEach(frameworks => {
      if (Array.isArray(frameworks)) {
        frameworks.forEach(f => detected.add(f));
      }
    });
  }

  // Cloud
  if (stackProfile.cloud && Array.isArray(stackProfile.cloud)) {
    stackProfile.cloud.forEach(c => detected.add(c));
  }

  // Containers
  if (stackProfile.containers && Array.isArray(stackProfile.containers)) {
    stackProfile.containers.forEach(c => detected.add(c));
  }

  // Dependencies (ML/AI libraries, etc.)
  if (stackProfile.dependencies && Array.isArray(stackProfile.dependencies)) {
    stackProfile.dependencies.forEach(d => detected.add(d));
  }

  return Array.from(detected).sort();
}

/**
 * Detect stack from framework-config.json
 *
 * If config doesn't exist (project not initialized), returns empty array.
 * This is intentional - projects must be initialized first.
 */
function detectStack(projectPath) {
  const config = readFrameworkConfig(projectPath);

  if (!config || !config.stack_profile) {
    return [];
  }

  return stackProfileToArray(config.stack_profile);
}

module.exports = {
  detectStack,
  readFrameworkConfig,
  stackProfileToArray
};
