/**
 * Stack Detection - Simplified Interface
 *
 * Provides both new (simple array) and old (complex object) interfaces
 * for backward compatibility.
 */

const { detectStack: simpleDetect } = require('./simple-detect');

/**
 * Detect stack and return in old format for backward compatibility
 */
async function detectStack(projectPath) {
  try {
    const detected = simpleDetect(projectPath);
    const profile = convertToLegacyFormat(detected);

    return {
      success: true,
      profile
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      profile: null
    };
  }
}

/**
 * Convert simple array to legacy stackProfile format
 */
function convertToLegacyFormat(detectedArray) {
  const profile = {
    languages: [],
    frameworks: { frontend: [], backend: [], mobile: [] },
    testing: [],
    cloud: [],
    containers: [],
    dependencies: []
  };

  // Language list
  const languageSet = ['typescript', 'javascript', 'python', 'go', 'rust', 'java', 'ruby', 'php'];
  const frontendSet = ['react', 'vue', 'angular', 'nextjs', 'svelte'];
  const backendSet = ['express', 'fastapi', 'django', 'nestjs'];
  const testingSet = ['jest', 'vitest', 'playwright', 'pytest', 'mocha', 'chai'];
  const cloudSet = ['aws', 'aws-cdk', 'gcp', 'firebase'];
  const containerSet = ['docker', 'docker-compose'];
  const mlLibs = ['pytorch', 'torch', 'tensorflow', 'langgraph', 'langchain'];

  for (const tech of detectedArray) {
    if (languageSet.includes(tech)) {
      profile.languages.push(tech);
    } else if (frontendSet.includes(tech)) {
      profile.frameworks.frontend.push(tech);
    } else if (backendSet.includes(tech)) {
      profile.frameworks.backend.push(tech);
    } else if (testingSet.includes(tech)) {
      profile.testing.push(tech);
    } else if (cloudSet.includes(tech)) {
      profile.cloud.push(tech);
    } else if (containerSet.includes(tech)) {
      profile.containers.push(tech);
    } else if (mlLibs.includes(tech)) {
      profile.dependencies.push(tech);
    }
  }

  // Determine primary language
  if (profile.languages.length > 0) {
    profile.primary_language = profile.languages[0];
  }

  return profile;
}

/**
 * Get simple detected array directly
 */
function detectStackSimple(projectPath) {
  return simpleDetect(projectPath);
}

// Legacy compatibility functions
async function detectLanguages(projectPath) {
  const profile = (await detectStack(projectPath)).profile;
  return profile ? profile.languages : [];
}

async function detectFrameworks(projectPath) {
  const profile = (await detectStack(projectPath)).profile;
  return profile ? profile.frameworks : { frontend: [], backend: [] };
}

async function detectTesting(projectPath) {
  const profile = (await detectStack(projectPath)).profile;
  return profile ? profile.testing : [];
}

module.exports = {
  detectStack,
  detectStackSimple,
  detectLanguages,
  detectFrameworks,
  detectTesting
};
