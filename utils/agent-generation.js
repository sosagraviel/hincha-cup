/**
 * Agent Generation Module
 *
 * Generates stack-specific agents from templates by substituting variables
 * with detected stack information and project-specific commands.
 *
 * Features:
 * - Generates agents for planning, implementation, testing, review, verification, documentation
 * - visual-verifier agent for Phase 6 (Visual Verification)
 * - doc-updater agent for Phase 7 (Documentation Update)
 * - Support for verification and documentation agent categories
 * - Runtime variable substitution for ticket-specific agents
 *
 * @author AI Framework Team
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Handlebars = require("handlebars");
const {
  resolveAgentSkills,
  getPrimaryLanguage,
  getAllLanguages,
} = require("./skill-registry");

// Handlebars helpers
Handlebars.registerHelper("formatSkills", (skills) =>
  !skills?.length ? "[]" : "\n  - " + skills.join("\n  - "),
);

Handlebars.registerHelper("skillsDoc", (skills) => {
  if (!skills?.length) return "No skills preloaded.";
  return (
    "The following skills are preloaded and available:\n\n" +
    skills
      .map((s) => `- **${s}**: Provides patterns and conventions for this area`)
      .join("\n") +
    "\n"
  );
});

// Default commands for each language
const DEFAULT_COMMANDS = {
  typescript: {
    lint: "npx eslint . --ext .ts,.tsx",
    format: "npx prettier --write .",
    typecheck: "npx tsc --noEmit",
    test: "npm test",
    build: "npm run build",
    test_framework: "vitest",
    e2e: "npx playwright test",
    coverage: "npm test -- --coverage",
    coverage_view: "open coverage/index.html",
    audit: "npm audit",
  },
  javascript: {
    lint: "npx eslint . --ext .js,.jsx",
    format: "npx prettier --write .",
    typecheck: "Not applicable (JavaScript is not statically typed)",
    test: "npm test",
    build: "Not applicable (JavaScript runs without compilation)",
    test_framework: "vitest",
    e2e: "npx playwright test",
    coverage: "npm test -- --coverage",
    coverage_view: "open coverage/index.html",
    audit: "npm audit",
  },
  python: {
    lint: "ruff check .",
    format: "ruff format .",
    typecheck: "mypy .",
    test: "pytest tests/",
    build: "Not applicable (Python is interpreted)",
    test_framework: "pytest",
    e2e: "pytest tests/e2e/",
    coverage: "pytest --cov=src --cov-report=html",
    coverage_view: "open htmlcov/index.html",
    audit: "safety check",
  },
  go: {
    lint: "golangci-lint run",
    format: "go fmt ./...",
    typecheck: "go vet ./...",
    test: "go test ./...",
    build: "go build ./...",
    test_framework: "testing",
    e2e: "go test ./e2e/...",
    coverage: "go test -cover ./...",
    coverage_view: "go tool cover -html=coverage.out",
    audit: "go list -m all | nancy sleuth",
  },
  rust: {
    lint: "cargo clippy",
    format: "cargo fmt",
    typecheck: "cargo check",
    test: "cargo test",
    build: "cargo build",
    test_framework: "cargo test",
    e2e: "cargo test --test e2e",
    coverage: "cargo tarpaulin",
    coverage_view: "open tarpaulin-report.html",
    audit: "cargo audit",
  },
};

const getDefault = (lang, cmd) =>
  DEFAULT_COMMANDS[lang]?.[cmd] || `echo "No ${cmd} command configured"`;

// Language-specific test patterns
const TEST_PATTERNS = {
  typescript: {
    file_pattern: "*.spec.ts or *.test.ts",
    mock_library: "vitest.fn(), vitest.mock()",
    assertion_style: "expect(value).toBe(expected)",
  },
  javascript: {
    file_pattern: "*.spec.js or *.test.js",
    mock_library: "vitest.fn(), vitest.mock()",
    assertion_style: "expect(value).toBe(expected)",
  },
  python: {
    file_pattern: "test_*.py or *_test.py",
    mock_library: "pytest-mock, unittest.mock",
    assertion_style: "assert value == expected",
  },
};

// Template reading helper with fallback logic
async function findTemplate(templatesPath, name, language = null) {
  const paths = language
    ? [
        path.join(templatesPath, language, `${name}.template.md`),
        path.join(templatesPath, "shared", `${name}.template.md`),
        path.join(templatesPath, `${name}.template.md`),
      ]
    : [path.join(templatesPath, `${name}.template.md`)];

  for (const p of paths) {
    const content = await readFile(p);
    if (content) return content;
  }
  return null;
}

// Compile template and create agent metadata
function compileAgent(
  templateContent,
  context,
  { name, filename, model, description },
) {
  const template = Handlebars.compile(templateContent);
  const content = template(context);
  return { name, filename, content, model, description };
}

/**
 * Main entry point for agent generation
 * @param {Object} stackProfile - Stack profile from stack-detection.js
 * @param {Object} skillSelection - Selected skills from skill-selection.js
 * @param {string} projectPath - Absolute path to project root
 * @param {string} templatesPath - Path to agent templates directory
 * @returns {Promise<Object>} Generated agents with metadata
 */
async function generateAgents(
  stackProfile,
  skillSelection,
  projectPath,
  templatesPath,
) {
  const generation = {
    planning: [],
    implementation: [],
    testing: [],
    review: [],
    verification: [],
    documentation: [],
    total: 0,
  };

  // Validate that stack detection properly included all significant languages
  const languagesFromProfile = getAllLanguages(stackProfile);
  const languagesFromFileCounts = Object.keys(
    stackProfile.file_counts || {},
  ).filter((lang) => stackProfile.file_counts[lang] >= 10);

  const missingLanguages = languagesFromFileCounts.filter(
    (lang) => !languagesFromProfile.includes(lang),
  );

  if (missingLanguages.length > 0) {
    console.error(
      `❌ ERROR: Languages with significant code missing from stack profile: ${missingLanguages.join(", ")}`,
    );
    console.error(
      `  This indicates a bug in stack detection. Languages must be detected during stack`,
    );
    console.error(
      `  detection phase, NOT auto-added during agent generation, to ensure skills are copied.`,
    );
    console.error(
      `  File counts: ${missingLanguages.map((l) => `${l}(${stackProfile.file_counts[l]} files)`).join(", ")}`,
    );
    throw new Error(
      `Stack profile missing languages: ${missingLanguages.join(", ")}. Run stack detection again.`,
    );
  }

  try {
    // 1. Generate planner agent (with architecture-level skills for ALL languages)
    const plannerSkills = resolveAgentSkills("planner", stackProfile);
    const plannerAgent = await generatePlannerAgent(
      templatesPath,
      plannerSkills,
    );
    if (plannerAgent) {
      generation.planning.push(plannerAgent);
    }

    // 2. Generate implementer agents - ONE PER DETECTED LANGUAGE
    const languages = getAllLanguages(stackProfile);
    for (const language of languages) {
      // Extract language-specific commands
      const commands = await extractCommandsForLanguage(
        projectPath,
        stackProfile,
        language,
      );

      const implementerSkills = resolveAgentSkills(
        `implementer-${language}`,
        stackProfile,
      );
      const implementerAgent = await generateImplementerAgent(
        templatesPath,
        stackProfile,
        implementerSkills,
        commands,
        language,
      );
      if (implementerAgent) {
        generation.implementation.push(implementerAgent);
      }
    }

    // 3. Generate tester agents - ONE SET PER DETECTED LANGUAGE
    for (const language of languages) {
      // Extract language-specific commands
      const commands = await extractCommandsForLanguage(
        projectPath,
        stackProfile,
        language,
      );

      // Testing agents removed - use skills instead (jest-coverage-automation, playwright-e2e-automation)
    }

    // 6. Generate visual verifier agent (for frontend projects with visual verification)
    if (
      stackProfile.frontend_frameworks &&
      stackProfile.frontend_frameworks.length > 0
    ) {
      const visualVerifierSkills = resolveAgentSkills(
        "visual-verifier",
        stackProfile,
      );
      const visualVerifierAgent = await generateVisualVerifierAgent(
        templatesPath,
        visualVerifierSkills,
        stackProfile,
      );
      if (visualVerifierAgent) {
        generation.verification.push(visualVerifierAgent);
      }
    }

    // Doc updater agent removed - use update-project-context skill instead

    // Calculate total
    generation.total =
      generation.planning.length +
      generation.implementation.length +
      generation.testing.length +
      generation.review.length +
      generation.verification.length +
      generation.documentation.length;

    return generation;
  } catch (error) {
    console.error("Agent generation error:", error.message);
    throw new Error(`Failed to generate agents: ${error.message}`);
  }
}

/**
 * Extract commands from project configuration files for a specific language
 * @param {string} projectPath - Path to the project
 * @param {object} stackProfile - Stack detection profile
 * @param {string} language - Language to extract commands for (typescript, javascript, python, etc.)
 */
async function extractCommandsForLanguage(projectPath, stackProfile, language) {
  const commands = {
    lint_command: null,
    format_command: null,
    type_check_command: null,
    unit_test_command: null,
    integration_test_command: null,
    e2e_test_command: null,
    coverage_command: null,
    build_command: null,
    test_framework: null,
    e2e_framework: null,
  };

  if (language === "typescript" || language === "javascript") {
    const packageJson = await readPackageJson(projectPath);

    if (packageJson?.scripts) {
      const scripts = packageJson.scripts;
      const packageManager = stackProfile.package_manager || "npm";

      // Map common script names to commands
      commands.lint_command = findScript(scripts, ["lint:check", "lint"])
        ? `${packageManager} run ${findScript(scripts, ["lint:check", "lint"])}`
        : "npx eslint .";

      commands.format_command = findScript(scripts, ["format", "prettier"])
        ? `${packageManager} run ${findScript(scripts, ["format", "prettier"])}`
        : "npx prettier --write .";

      commands.type_check_command = findScript(scripts, [
        "type:check",
        "typecheck",
        "tsc",
      ])
        ? `${packageManager} run ${findScript(scripts, ["type:check", "typecheck", "tsc"])}`
        : "npx tsc --noEmit";

      commands.unit_test_command = findScript(scripts, ["test:unit", "test"])
        ? `${packageManager} run ${findScript(scripts, ["test:unit", "test"])}`
        : "npx jest";

      commands.integration_test_command = findScript(scripts, [
        "test:integration",
        "test:int",
      ])
        ? `${packageManager} run ${findScript(scripts, ["test:integration", "test:int"])}`
        : null;

      commands.e2e_test_command = findScript(scripts, [
        "test:e2e",
        "test:playwright",
        "test:cypress",
      ])
        ? `${packageManager} run ${findScript(scripts, ["test:e2e", "test:playwright", "test:cypress"])}`
        : "npx playwright test";

      commands.coverage_command = findScript(scripts, [
        "test:coverage",
        "coverage",
      ])
        ? `${packageManager} run ${findScript(scripts, ["test:coverage", "coverage"])}`
        : `${commands.unit_test_command} -- --coverage`;

      commands.build_command = findScript(scripts, ["build", "compile"])
        ? `${packageManager} run ${findScript(scripts, ["build", "compile"])}`
        : "npx tsc";
    }

    // Detect test framework
    if (stackProfile.testing) {
      const unitTest = stackProfile.testing.find((t) => t.type === "unit");
      const e2eTest = stackProfile.testing.find((t) => t.type === "e2e");

      commands.test_framework = unitTest?.name || "jest";
      commands.e2e_framework = e2eTest?.name || null;
    }
  }

  if (language === "python") {
    // Python command defaults
    commands.lint_command = "ruff check .";
    commands.format_command = "black .";
    commands.type_check_command = "mypy .";
    commands.unit_test_command = "pytest tests/";
    commands.coverage_command = "pytest --cov=src tests/";
    commands.test_framework = "pytest";

    // Check for Django
    if (stackProfile.backend?.framework === "django") {
      commands.unit_test_command = "python manage.py test";
      commands.coverage_command =
        "coverage run manage.py test && coverage report";
      commands.build_command = "python manage.py collectstatic --noinput";
    } else {
      commands.build_command = "python -m build";
    }
  }

  // Add more languages here as needed (Go, Rust, Ruby, etc.)

  return commands;
}

/**
 * Find a script name from a list of candidates
 */
function findScript(scripts, candidates) {
  for (const candidate of candidates) {
    if (scripts[candidate]) {
      return candidate;
    }
  }
  return null;
}

async function generatePlannerAgent(templatesPath, skills) {
  const template = await findTemplate(templatesPath, "planner");
  if (!template) return null;

  return compileAgent(
    template,
    { skills },
    {
      name: "planner",
      filename: "planner.md",
      model: "opus",
      description:
        "Create detailed implementation plans with full architecture awareness",
    },
  );
}

async function generateImplementerAgent(
  templatesPath,
  stackProfile,
  skills,
  commands,
  language,
) {
  const template = await findTemplate(templatesPath, "implementer", language);
  if (!template) return null;

  return compileAgent(
    template,
    {
      stack: language,
      skills,
      lint_command: commands.lint_command || getDefault(language, "lint"),
      format_command: commands.format_command || getDefault(language, "format"),
      type_check_command:
        commands.type_check_command || getDefault(language, "typecheck"),
      unit_test_command:
        commands.unit_test_command || getDefault(language, "test"),
      build_command: commands.build_command || getDefault(language, "build"),
      typecheck_command:
        commands.type_check_command || getDefault(language, "typecheck"),
      test_command: commands.unit_test_command || getDefault(language, "test"),
    },
    {
      name: `implementer-${language}`,
      filename: `implementer-${language}.md`,
      model: "sonnet",
      description: `Implement ${language} code following team conventions`,
    },
  );
}

// Removed: generateTesterAgents - testing now handled by skills (jest-coverage-automation, playwright-e2e-automation)
// Removed: generateSecurityReviewerAgent - security now handled by security-review skill

async function generateVisualVerifierAgent(
  templatesPath,
  skills,
  stackProfile,
) {
  const template = await findTemplate(templatesPath, "visual-verifier");
  if (!template) return null;

  // Runtime variables (JIRA_KEY, PROJECT_ROOT, CHANGED_FILES) substituted later
  return compileAgent(
    template,
    {},
    {
      name: "visual-verifier",
      filename: "visual-verifier.md",
      model: "opus",
      description: "Visual verification and UI diff analysis",
    },
  );
}

// Removed: generateDocUpdaterAgent - documentation now handled by doc-updater skill

/**
 * Write generated agents to .claude/agents/ directory
 */
async function writeAgents(generation, projectPath) {
  const destDir = path.join(projectPath, ".claude", "agents");

  // Ensure directory exists
  await fs.promises.mkdir(destDir, { recursive: true });

  const written = [];
  const errors = [];

  // Combine all agents
  const allAgents = [
    ...generation.planning,
    ...generation.implementation,
    ...generation.testing,
    ...generation.review,
    ...generation.verification,
    ...generation.documentation,
  ];

  for (const agent of allAgents) {
    try {
      const destPath = path.join(destDir, agent.filename);
      await fs.promises.writeFile(destPath, agent.content, "utf8");

      written.push({
        name: agent.name,
        path: destPath,
        model: agent.model,
      });
    } catch (error) {
      errors.push({
        name: agent.name,
        error: error.message,
      });
    }
  }

  return { written, errors };
}

async function readFile(filePath) {
  try {
    return await fs.promises.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function readPackageJson(projectPath) {
  const content = await readFile(path.join(projectPath, "package.json"));
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Generate agents with tracking metadata for framework-config.json
 * @param {Object} stackProfile - Stack profile from stack-detection.js
 * @param {Object} skillSelection - Selected skills from skill-selection.js
 * @param {string} projectPath - Absolute path to project root
 * @param {string} templatesPath - Path to agent templates directory
 * @param {string} frameworkPath - Path to framework root
 * @returns {Promise<Object>} { generation, agentsTracking }
 */
async function generateAgentsWithTracking(
  stackProfile,
  skillSelection,
  projectPath,
  templatesPath,
  frameworkPath,
) {
  const generation = await generateAgents(
    stackProfile,
    skillSelection,
    projectPath,
    templatesPath,
  );

  const agentsTracking = {};
  const timestamp = new Date().toISOString();

  const allAgents = [
    ...generation.planning,
    ...generation.implementation,
    ...generation.testing,
    ...generation.review,
    ...generation.verification,
    ...generation.documentation,
  ];

  for (const agent of allAgents) {
    const templatePath = getTemplatePathForAgent(
      agent.name,
      templatesPath,
      frameworkPath,
    );
    const templateHash = hashFile(templatePath);

    agentsTracking[agent.name] = {
      template_path: path.relative(frameworkPath, templatePath),
      generated_timestamp: timestamp,
      template_hash: templateHash,
      file_hash: null,
      managed_by_framework: true,
      user_modified: false,
      language: agent.name.includes("-") ? agent.name.split("-")[1] : null,
      category: getCategoryForAgent(agent.name, generation),
      last_sync: timestamp,
    };
  }

  const writeResult = await writeAgents(generation, projectPath);

  for (const written of writeResult.written) {
    if (agentsTracking[written.name]) {
      agentsTracking[written.name].file_hash = hashFile(written.path);
    }
  }

  return {
    generation,
    agentsTracking,
    writeResult,
  };
}

/**
 * Regenerate a single agent (used by sync script when template changes)
 * @param {string} agentName - Name of agent to regenerate
 * @param {string} projectPath - Absolute path to project root
 * @param {string} frameworkPath - Path to framework root
 * @returns {Promise<Object>} { success, agent, tracking }
 */
async function regenerateSingleAgent(agentName, projectPath, frameworkPath) {
  const { ConfigUpdater } = require("./config-updater.js");
  const configUpdater = new ConfigUpdater(projectPath, frameworkPath);

  try {
    const config = await configUpdater.readConfig();
    const agentInfo = config.resource_state.agents[agentName];

    if (!agentInfo) {
      throw new Error(`Agent ${agentName} not found in config`);
    }

    if (!agentInfo.managed_by_framework) {
      console.log(`Skipping ${agentName} - user-managed agent`);
      return { success: false, skipped: true, reason: "user-managed" };
    }

    const stackProfile = config.stack_profile;
    const templatesPath = path.join(frameworkPath, "agents", "templates");

    const language = agentInfo.language;
    const category = agentInfo.category;

    let agent = null;

    if (category === "planning") {
      const skills = await resolveAgentSkills("planner", stackProfile);
      agent = await generatePlannerAgent(templatesPath, skills);
    } else if (category === "implementation") {
      const skills = await resolveAgentSkills(agentName, stackProfile);
      const commands = await extractCommandsForLanguage(
        projectPath,
        stackProfile,
        language,
      );
      agent = await generateImplementerAgent(
        templatesPath,
        stackProfile,
        skills,
        commands,
        language,
      );
    } else if (category === "verification") {
      const skills = await resolveAgentSkills("visual-verifier", stackProfile);
      agent = await generateVisualVerifierAgent(
        templatesPath,
        skills,
        stackProfile,
      );
    }
    // Removed categories: "testing", "review", "documentation" - now handled by skills

    if (!agent) {
      throw new Error(`Failed to regenerate agent ${agentName}`);
    }

    const agentPath = path.join(
      projectPath,
      ".claude",
      "agents",
      agent.filename,
    );
    await fs.promises.writeFile(agentPath, agent.content, "utf8");

    const templatePath = path.join(
      templatesPath,
      getTemplateFilename(agentName),
    );
    const tracking = {
      template_path: path.relative(frameworkPath, templatePath),
      generated_timestamp: new Date().toISOString(),
      template_hash: hashFile(templatePath),
      file_hash: hashFile(agentPath),
      managed_by_framework: true,
      user_modified: false,
      language: language,
      category: category,
      last_sync: new Date().toISOString(),
    };

    await configUpdater.updateResourceState("agents", agentName, tracking);

    return {
      success: true,
      agent,
      tracking,
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Add a new agent (used by sync script when stack changes)
 * @param {string} agentName - Name of agent to add
 * @param {string} projectPath - Absolute path to project root
 * @param {string} frameworkPath - Path to framework root
 * @returns {Promise<Object>} { success, agent, tracking }
 */
async function addSingleAgent(agentName, projectPath, frameworkPath) {
  return regenerateSingleAgent(agentName, projectPath, frameworkPath);
}

/**
 * Hash a file for change detection
 * @param {string} filePath - Path to file
 * @returns {string} SHA-256 hash
 */
function hashFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Get template path for agent
 * @param {string} agentName - Name of agent
 * @param {string} templatesPath - Path to templates directory
 * @param {string} frameworkPath - Path to framework root
 * @returns {string} Template path
 */
function getTemplatePathForAgent(agentName, templatesPath, frameworkPath) {
  const filename = getTemplateFilename(agentName);
  return path.join(templatesPath, filename);
}

/**
 * Get template filename for agent
 * @param {string} agentName - Name of agent
 * @returns {string} Template filename
 */
function getTemplateFilename(agentName) {
  if (agentName === "planner") {
    return "planner.template.md";
  } else if (agentName.startsWith("implementer-")) {
    return "implementer.template.md";
  } else if (agentName === "visual-verifier") {
    return "visual-verifier.template.md";
  }

  throw new Error(`Unknown agent type: ${agentName}`);
}

/**
 * Get category for agent
 * @param {string} agentName - Name of agent
 * @param {Object} generation - Generation result
 * @returns {string} Category
 */
function getCategoryForAgent(agentName, generation) {
  if (generation.planning.find((a) => a.name === agentName)) return "planning";
  if (generation.implementation.find((a) => a.name === agentName))
    return "implementation";
  if (generation.testing.find((a) => a.name === agentName)) return "testing";
  if (generation.review.find((a) => a.name === agentName)) return "review";
  if (generation.verification.find((a) => a.name === agentName))
    return "verification";
  if (generation.documentation.find((a) => a.name === agentName))
    return "documentation";
  return "unknown";
}

module.exports = {
  generateAgents,
  extractCommandsForLanguage,
  writeAgents,
  generateAgentsWithTracking,
  regenerateSingleAgent,
  addSingleAgent,
  hashFile,
};

if (require.main === module) {
  // Accept proper command-line arguments from phase5 script
  // Usage: node agent-generation.js <stack-profile.json> <skill-selection.json> <project-path> <templates-path>
  const stackProfilePath = process.argv[2];
  const skillSelectionPath = process.argv[3];
  const projectPath = process.argv[4] || process.cwd();
  const templatesPath =
    process.argv[5] || path.join(__dirname, "..", "agents", "templates");

  if (!stackProfilePath || !skillSelectionPath) {
    console.error(
      "Usage: node agent-generation.js <stack-profile.json> <skill-selection.json> <project-path> <templates-path>",
    );
    process.exit(1);
  }

  // Read stack profile and skill selection from JSON files
  const stackProfile = JSON.parse(fs.readFileSync(stackProfilePath, "utf8"));
  const skillSelection = JSON.parse(
    fs.readFileSync(skillSelectionPath, "utf8"),
  );

  // Generate agents
  generateAgents(stackProfile, skillSelection, projectPath, templatesPath)
    .then(async (generation) => {
      // FIXED: Write agents to disk (this was missing!)
      const writeResult = await writeAgents(generation, projectPath);

      // Output results as JSON for phase5 script to parse
      // Include full agent arrays for index generation
      const result = {
        total: generation.total,
        planning: generation.planning,
        implementation: generation.implementation,
        testing: generation.testing,
        review: generation.review,
        verification: generation.verification,
        documentation: generation.documentation,
        written: writeResult.written,
        errors: writeResult.errors,
      };

      console.log(JSON.stringify(result));
    })
    .catch((error) => {
      console.error("Error:", error.message);
      console.error(error.stack);
      process.exit(1);
    });
}
