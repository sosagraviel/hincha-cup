/**
 * Skill Registry - Central skill categorization and context management
 *
 * This module defines:
 * - Skill taxonomy and categories
 * - Agent-to-skill mapping strategies
 * - Smart skill resolution based on stack detection
 */

/**
 * Skill Registry - Semantic categorization of all available skills
 */
const SKILL_REGISTRY = {
  // UNIVERSAL - All agents receive these
  universal: [{ name: "project-context", category: "010-foundation" }],

  // PLANNING - Planner/Architect agents only
  planning: {
    core: [
      { name: "analyze-requirements", category: "020-development-workflow" },
      { name: "design-doc-mermaid", category: "060-documentation" },
      { name: "architect-agent", category: "020-development-workflow" },
    ],
  },

  // IMPLEMENTATION - Language and framework specific
  implementation: {
    languages: {
      typescript: {
        core: ["mastering-typescript"],
        frontend: {
          react: ["react-frontend", "atomic-design-react"],
          vue: ["vue-frontend"],
          angular: ["angular-patterns"],
        },
        backend: {
          nestjs: [], // Patterns embedded in mastering-typescript
          express: [],
        },
      },
      javascript: {
        core: ["mastering-typescript"], // TS skill covers modern JS
        frontend: {
          react: ["react-frontend", "atomic-design-react"],
          vue: ["vue-frontend"],
          angular: ["angular-patterns"],
        },
        backend: {
          express: [],
        },
      },
      python: {
        core: ["mastering-python-skill"],
        backend: {
          fastapi: [],
          django: [],
          flask: [],
        },
        ml: [
          "mastering-pytorch-rl-nlp-agentic-skill",
          "mastering-langgraph-agent-skill",
        ],
      },
      go: {
        core: ["mastering-go-skill"],
      },
      java: {
        core: ["mastering-java-skill"],
      },
      rust: {
        core: ["mastering-rust-skill"],
      },
      ruby: {
        core: ["mastering-ruby-skill"],
      },
    },
  },

  // TESTING - Framework specific
  testing: {
    unit: {
      jest: ["jest-coverage-automation"],
      vitest: ["jest-coverage-automation"], // Same patterns
      pytest: ["pytest-patterns"],
    },
    e2e: {
      playwright: ["playwright-e2e-automation"],
      cypress: [], // Future
    },
    quality: ["code-quality-check"],
  },

  // SECURITY
  security: {
    core: ["security-review"],
  },

  // INTEGRATIONS - Based on detection
  integrations: {
    ticketing: ["fetch-ticket-context", "jira"],
    documentation: [
      "mastering-confluence-agent-skill",
      "notion-document-manager",
    ],
    vcs: ["mastering-github-agent-skill"],
  },

  // INFRASTRUCTURE - Based on detection
  infrastructure: {
    containers: {
      docker: ["developing-with-docker"],
    },
    cloud: {
      aws: ["mastering-aws-cli"],
      "aws-cdk": ["mastering-aws-cdk"],
      gcp: ["mastering-gcloud-commands"],
      firebase: ["using-firebase"],
    },
  },

  // WORKFLOW - Orchestration skills
  workflow: [
    { name: "start-task", category: "010-foundation" },
    { name: "update-project-context", category: "010-foundation" },
    { name: "implement-ticket", category: "020-development-workflow" },
    { name: "create-pr", category: "030-quality-assurance" },
    { name: "pr-reviewer", category: "030-quality-assurance" },
    { name: "mastering-git-cli", category: "020-development-workflow" },
  ],
};

/**
 * Agent-to-Skill Mapping Strategies
 * Defines which skills each agent type should receive
 */
const AGENT_SKILL_MAPPING = {
  // PLANNER AGENT - High-level architecture for ALL languages
  planner: {
    description:
      "Create detailed implementation plans with full architecture awareness",
    model: "opus",
    getSkills: (stackProfile) => {
      const skills = [];

      // Universal
      skills.push("project-context");

      // Planning core
      skills.push(
        "analyze-requirements",
        "design-doc-mermaid",
        "architect-agent",
      );

      // Language mastery skills for ALL detected languages (architecture awareness)
      if (stackProfile.languages && stackProfile.languages.length > 0) {
        stackProfile.languages.forEach((lang) => {
          const langConfig = SKILL_REGISTRY.implementation.languages[lang.name];
          if (langConfig && langConfig.core) {
            skills.push(...langConfig.core);
          }
        });
      }

      // Infrastructure awareness
      if (stackProfile.containers && stackProfile.containers.length > 0) {
        const dockerContainer = stackProfile.containers.find(
          (c) => c.name === "docker" || c.name === "docker-compose",
        );
        if (dockerContainer) {
          skills.push("developing-with-docker");
        }
      }

      // Cloud platform awareness
      if (stackProfile.cloud && stackProfile.cloud.length > 0) {
        stackProfile.cloud.forEach((platform) => {
          const cloudConfig =
            SKILL_REGISTRY.infrastructure.cloud[platform.name];
          if (cloudConfig) {
            skills.push(...cloudConfig);
          }
        });
      }

      return [...new Set(skills)]; // Deduplicate
    },
  },

  // IMPLEMENTER AGENT - Language-specific implementation
  implementer: {
    description:
      "Implement code following team conventions for specific language",
    model: "sonnet",
    getSkills: (stackProfile, language) => {
      const skills = [];

      // Universal
      skills.push("project-context");

      // Language mastery
      const langConfig = SKILL_REGISTRY.implementation.languages[language];
      if (langConfig && langConfig.core) {
        skills.push(...langConfig.core);
      }

      // Frontend framework skills (for TypeScript/JavaScript)
      if (language === "typescript" || language === "javascript") {
        const frontendFrameworks = stackProfile.frameworks?.frontend || [];
        frontendFrameworks.forEach((fwName) => {
          const fwSkills = langConfig.frontend?.[fwName];
          if (fwSkills) {
            skills.push(...fwSkills);
          }
        });
      }

      // Backend framework skills
      if (langConfig.backend) {
        const backendFrameworks = stackProfile.frameworks?.backend || [];
        backendFrameworks.forEach((fwName) => {
          const bwSkills = langConfig.backend[fwName];
          if (bwSkills) {
            skills.push(...bwSkills);
          }
        });
      }

      // ML/AI skills for Python
      if (language === "python" && langConfig.ml) {
        // Check if project has ML/AI indicators
        // For now, include if packages like pytorch, tensorflow detected
        // This could be enhanced with better detection
        const hasML = stackProfile.package_managers?.some((pm) =>
          pm.files?.some(
            (f) =>
              f.includes("torch") ||
              f.includes("tensorflow") ||
              f.includes("langchain") ||
              f.includes("langgraph"),
          ),
        );
        if (hasML) {
          skills.push(...langConfig.ml);
        }
      }

      return [...new Set(skills)]; // Deduplicate
    },
  },

  // TESTER-UNIT AGENT - Unit/Integration testing
  "tester-unit": {
    description: "Write unit and integration tests",
    model: "sonnet",
    getSkills: (stackProfile, language) => {
      const skills = [];

      // Universal
      skills.push("project-context");

      // Quality check
      skills.push("code-quality-check");

      // Language mastery (to understand code under test)
      const langConfig = SKILL_REGISTRY.implementation.languages[language];
      if (langConfig && langConfig.core) {
        skills.push(...langConfig.core);
      }

      // Testing framework
      if (stackProfile.testing && stackProfile.testing.length > 0) {
        const unitTests = stackProfile.testing.filter(
          (t) => t.type === "unit" || t.type === "integration",
        );
        unitTests.forEach((test) => {
          const testSkills = SKILL_REGISTRY.testing.unit[test.name];
          if (testSkills) {
            skills.push(...testSkills);
          }
        });
      }

      return [...new Set(skills)];
    },
  },

  // TESTER-E2E AGENT - End-to-end testing
  "tester-e2e": {
    description: "Write end-to-end tests",
    model: "sonnet",
    getSkills: (stackProfile, language) => {
      const skills = [];

      // Universal
      skills.push("project-context");

      // E2E framework
      if (stackProfile.testing && stackProfile.testing.length > 0) {
        const e2eTests = stackProfile.testing.filter((t) => t.type === "e2e");
        e2eTests.forEach((test) => {
          const testSkills = SKILL_REGISTRY.testing.e2e[test.name];
          if (testSkills) {
            skills.push(...testSkills);
          }
        });
      }

      // Frontend framework awareness (for E2E tests)
      if (language === "typescript" || language === "javascript") {
        const langConfig = SKILL_REGISTRY.implementation.languages.typescript;
        const frontendFrameworks = stackProfile.frameworks?.frontend || [];
        frontendFrameworks.forEach((fwName) => {
          const fwSkills = langConfig.frontend?.[fwName];
          if (fwSkills) {
            skills.push(...fwSkills);
          }
        });
      }

      return [...new Set(skills)];
    },
  },

  // SECURITY-REVIEWER AGENT
  "security-reviewer": {
    description: "Security review and vulnerability detection",
    model: "sonnet",
    getSkills: (stackProfile, language) => {
      const skills = [];

      // Universal
      skills.push("project-context");

      // Security core
      skills.push("security-review");

      // Language mastery for understanding security implications
      const langConfig = SKILL_REGISTRY.implementation.languages[language];
      if (langConfig && langConfig.core) {
        skills.push(...langConfig.core);
      }

      return [...new Set(skills)];
    },
  },

  // VISUAL-VERIFIER AGENT - Visual verification for UI implementations
  "visual-verifier": {
    description:
      "Visual verification comparing screenshots with expected designs",
    model: "opus",
    getSkills: (stackProfile) => {
      const skills = [];

      // Universal
      skills.push("project-context");

      return [...new Set(skills)];
    },
  },
};

/**
 * Parse agent type string to extract base type and language
 * @param {string} agentType - e.g., "implementer-typescript", "tester-unit-typescript", "planner"
 * @returns {{baseType: string, language: string|null}}
 */
function parseAgentType(agentType) {
  // Handle special cases for multi-part base types
  const multiPartBaseTypes = [
    "tester-unit",
    "tester-e2e",
    "security-reviewer",
    "visual-verifier",
  ];

  for (const baseType of multiPartBaseTypes) {
    if (agentType.startsWith(baseType + "-")) {
      const language = agentType.substring(baseType.length + 1);
      return { baseType, language };
    } else if (agentType === baseType) {
      return { baseType, language: null };
    }
  }

  // Standard parsing for simple types like "implementer-typescript" or "planner"
  const parts = agentType.split("-");

  if (parts.length === 1) {
    return { baseType: agentType, language: null };
  }

  const baseType = parts[0];
  const language = parts.slice(1).join("-");

  return { baseType, language };
}

/**
 * Resolve skills for a specific agent based on stack profile
 * @param {string} agentType - Type of agent (e.g., "planner", "implementer-typescript")
 * @param {Object} stackProfile - Detected stack profile from stack-detection.js
 * @returns {string[]} Array of skill names to include
 */
function resolveAgentSkills(agentType, stackProfile) {
  const { baseType, language } = parseAgentType(agentType);

  // Get mapping for this agent type
  const mapping = AGENT_SKILL_MAPPING[baseType];

  if (!mapping) {
    console.error(`Unknown agent type: ${agentType}`);
    return ["project-context"]; // Fallback to minimal
  }

  // Get skills using the mapping's getSkills function
  const skills = mapping.getSkills(stackProfile, language);

  return skills;
}

/**
 * Get primary language from stack profile
 * @param {Object} stackProfile - Stack profile
 * @returns {string|null} Primary language name
 */
function getPrimaryLanguage(stackProfile) {
  if (!stackProfile.languages || stackProfile.languages.length === 0) {
    return null;
  }

  // Return the first language (assumed to be primary)
  return stackProfile.languages[0].name;
}

/**
 * Get all languages from stack profile
 * @param {Object} stackProfile - Stack profile
 * @returns {string[]} Array of language names
 */
function getAllLanguages(stackProfile) {
  if (!stackProfile.languages || stackProfile.languages.length === 0) {
    return [];
  }

  return stackProfile.languages.map((l) => l.name);
}

module.exports = {
  SKILL_REGISTRY,
  AGENT_SKILL_MAPPING,
  resolveAgentSkills,
  parseAgentType,
  getPrimaryLanguage,
  getAllLanguages,
};
