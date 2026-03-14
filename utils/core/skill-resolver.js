/**
 * Simplified Skill Resolver
 *
 * Resolves skills using simple-resolver.js which matches against skills.config.json
 * Maintains backward compatibility with old stackProfile format.
 */

const { resolveSkills: simpleResolve } = require('../skills/simple-resolver');

/**
 * Convert old stackProfile format to simple detected stack array
 */
function stackProfileToDetectedArray(stackProfile) {
  const detected = new Set();

  // Languages
  if (stackProfile.languages) {
    for (const lang of stackProfile.languages) {
      const langName = typeof lang === 'object' ? lang.name : lang;
      detected.add(langName);
    }
  }

  // Frameworks
  if (stackProfile.frameworks) {
    if (stackProfile.frameworks.frontend) {
      stackProfile.frameworks.frontend.forEach(f => detected.add(f));
    }
    if (stackProfile.frameworks.backend) {
      stackProfile.frameworks.backend.forEach(f => detected.add(f));
    }
    if (stackProfile.frameworks.mobile) {
      stackProfile.frameworks.mobile.forEach(f => detected.add(f));
    }
  }

  // Testing
  if (stackProfile.testing) {
    stackProfile.testing.forEach(t => {
      const testName = typeof t === 'object' ? t.name : t;
      detected.add(testName);
    });
  }

  // Cloud
  if (stackProfile.cloud) {
    stackProfile.cloud.forEach(c => detected.add(c));
  }

  // Containers
  if (stackProfile.containers) {
    stackProfile.containers.forEach(c => detected.add(c));
  }

  // Dependencies (for ML/AI libraries)
  if (stackProfile.dependencies) {
    stackProfile.dependencies.forEach(d => detected.add(d));
  }

  return Array.from(detected);
}

/**
 * Resolve skills for a stack profile
 *
 * @param {Object|Array} stackProfileOrArray - Stack profile object or detected array
 * @param {string} frameworkPath - Path to framework root
 * @returns {Object[]} Array of skill objects to copy
 */
function resolveSkills(stackProfileOrArray, frameworkPath) {
  // If it's already an array, use it directly
  const detectedStack = Array.isArray(stackProfileOrArray)
    ? stackProfileOrArray
    : stackProfileToDetectedArray(stackProfileOrArray);

  return simpleResolve(detectedStack, frameworkPath);
}

module.exports = {
  resolveSkills
};
