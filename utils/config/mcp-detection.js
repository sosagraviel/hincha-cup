/**
 * MCP Auto-Detection Module
 *
 * Automatically detects which Model Context Protocol (MCP) servers a project needs
 * and generates configuration files with setup instructions.
 *
 * @version 1.0.0
 * @author AI Framework Team
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

/**
 * Main entry point for MCP detection
 * @param {string} projectPath - Absolute path to project root
 * @param {Object} stackProfile - Stack profile from stack-detection.js
 * @returns {Promise<Object>} MCP detection results with configurations
 */
async function detectMCPs(projectPath, stackProfile) {
  const results = {
    needed: [],
    configured: [],
    needs_setup: [],
    not_needed: [],
    mcp_config: {
      mcpServers: {},
    },
    env_variables: {},
    setup_instructions: [],
  };

  try {
    // Detect all potential MCPs
    const mcpChecks = [
      detectAtlassianMCP(projectPath),
      detectGitHubMCP(projectPath),
      detectPostgresMCP(projectPath, stackProfile),
      detectPlaywrightMCP(projectPath, stackProfile),
      detectNotionMCP(projectPath),
      detectGoogleSheetsMCP(projectPath),
      detectPencilMCP(projectPath),
    ];

    const detectionResults = await Promise.all(mcpChecks);

    // Process each detection result
    for (const detection of detectionResults) {
      if (detection.needed) {
        results.needed.push(detection);

        // Check for credentials
        const credentials = await checkCredentials(projectPath, detection);

        if (credentials.valid) {
          results.configured.push(detection);
          // Add to mcp.json config
          results.mcp_config.mcpServers[detection.name] = detection.config;
        } else {
          results.needs_setup.push(detection);
          // Add placeholder config
          results.mcp_config.mcpServers[detection.name] = detection.config;
          // Add required env variables
          Object.assign(results.env_variables, credentials.required_vars);
          // Add setup instructions
          results.setup_instructions.push(detection.setup_instructions);
        }
      } else {
        results.not_needed.push(detection);
      }
    }

    return results;
  } catch (error) {
    console.error("MCP detection error:", error.message);
    throw new Error(`Failed to detect MCPs: ${error.message}`);
  }
}

/**
 * Detect Atlassian MCP (Jira + Confluence)
 */
async function detectAtlassianMCP(projectPath) {
  let needed = false;
  const reasons = [];

  // Check CLAUDE.md
  const claudeMd = await readFile(projectPath, ".claude/CLAUDE.md");
  if (
    claudeMd &&
    (claudeMd.includes("Jira") || claudeMd.includes("Confluence"))
  ) {
    needed = true;
    reasons.push("Jira/Confluence mentioned in CLAUDE.md");
  }

  // Check for Jira skills
  const hasJiraSkill =
    (await directoryExists(projectPath, ".claude/skills/jira")) ||
    (await directoryExists(projectPath, ".claude/skills/fetch-ticket-context"));
  if (hasJiraSkill) {
    needed = true;
    reasons.push("Jira skills present");
  }

  // Check README
  const readme = await readFile(projectPath, "README.md");
  if (readme && (readme.includes("Jira") || readme.includes("Confluence"))) {
    needed = true;
    reasons.push("Jira/Confluence mentioned in README.md");
  }

  return {
    name: "atlassian",
    display_name: "Atlassian (Jira + Confluence)",
    needed,
    reasons,
    config: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-atlassian"],
      env: {
        ATLASSIAN_CLOUD_ID: "${ATLASSIAN_CLOUD_ID}",
        ATLASSIAN_USER_EMAIL: "${ATLASSIAN_USER_EMAIL}",
        ATLASSIAN_API_TOKEN: "${ATLASSIAN_API_TOKEN}",
      },
    },
    required_credentials: [
      "ATLASSIAN_CLOUD_ID",
      "ATLASSIAN_USER_EMAIL",
      "ATLASSIAN_API_TOKEN",
    ],
    setup_instructions: {
      name: "Atlassian (Jira + Confluence)",
      steps: [
        "Generate API token: https://id.atlassian.com/manage-profile/security/api-tokens",
        "Get Cloud ID: Visit https://api.atlassian.com/oauth/token/accessible-resources",
        "Add to .env:\n  ATLASSIAN_CLOUD_ID=your-cloud-id\n  ATLASSIAN_USER_EMAIL=you@company.com\n  ATLASSIAN_API_TOKEN=your-api-token",
      ],
      test_command:
        'curl -u "$ATLASSIAN_USER_EMAIL:$ATLASSIAN_API_TOKEN" "https://api.atlassian.com/oauth/token/accessible-resources"',
    },
  };
}

/**
 * Detect GitHub MCP
 */
async function detectGitHubMCP(projectPath) {
  let needed = false;
  const reasons = [];

  // Check git remote
  try {
    const remote = execSync("git remote get-url origin", {
      cwd: projectPath,
      encoding: "utf8",
    }).trim();
    if (remote.includes("github.com")) {
      needed = true;
      reasons.push("Git remote points to github.com");
    }
  } catch {
    // Not a git repo or no remote
  }

  // Check for .github directory
  if (await directoryExists(projectPath, ".github")) {
    needed = true;
    reasons.push(".github directory exists");
  }

  // Check for GitHub skills
  if (
    await directoryExists(projectPath, ".claude/skills/mastering-github-cli")
  ) {
    needed = true;
    reasons.push("GitHub skill present");
  }

  return {
    name: "github-mcp-server",
    display_name: "GitHub",
    needed,
    reasons,
    config: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
      env: {
        GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_PERSONAL_ACCESS_TOKEN}",
      },
    },
    required_credentials: ["GITHUB_PERSONAL_ACCESS_TOKEN"],
    setup_instructions: {
      name: "GitHub",
      steps: [
        "Visit https://github.com/settings/tokens/new",
        "Scopes needed: repo, read:org, read:user, workflow",
        "Generate token",
        "Add to .env:\n  GITHUB_PERSONAL_ACCESS_TOKEN=ghp_xxxxxxxxxxxx",
        "Or use GitHub CLI: gh auth login",
      ],
      test_command:
        'curl -H "Authorization: token $GITHUB_PERSONAL_ACCESS_TOKEN" https://api.github.com/user',
    },
  };
}

/**
 * Detect PostgreSQL MCP
 */
async function detectPostgresMCP(projectPath, stackProfile) {
  let needed = false;
  const reasons = [];

  // Check stack detection
  if (stackProfile?.databases?.some((db) => db.name === "postgresql")) {
    needed = true;
    reasons.push("PostgreSQL detected in stack");
  }

  // Check docker-compose
  const dockerCompose = await readDockerCompose(projectPath);
  if (dockerCompose && dockerCompose.includes("image: postgres")) {
    needed = true;
    reasons.push("PostgreSQL in docker-compose.yml");
  }

  return {
    name: "postgres",
    display_name: "PostgreSQL",
    needed,
    reasons,
    config: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-postgres"],
      env: {
        POSTGRES_CONNECTION_STRING: "${DATABASE_URL}",
      },
    },
    required_credentials: ["DATABASE_URL"],
    setup_instructions: {
      name: "PostgreSQL",
      steps: [
        "For docker-compose projects:\n  DATABASE_URL=postgresql://postgres:password@localhost:5432/dbname",
        "For remote databases:\n  DATABASE_URL=postgresql://user:pass@host:5432/dbname",
        "Add to .env:\n  DATABASE_URL=<your-connection-string>",
      ],
      test_command: 'psql "$DATABASE_URL" -c "SELECT version();"',
    },
  };
}

/**
 * Detect Playwright MCP
 */
async function detectPlaywrightMCP(projectPath, stackProfile) {
  let needed = false;
  const reasons = [];

  // Check stack detection
  if (stackProfile?.testing?.some((t) => t.name === "playwright")) {
    needed = true;
    reasons.push("Playwright detected in testing frameworks");
  }

  // Check for playwright.config
  if (
    (await fileExists(projectPath, "playwright.config.ts")) ||
    (await fileExists(projectPath, "playwright.config.js"))
  ) {
    needed = true;
    reasons.push("playwright.config found");
  }

  return {
    name: "playwright",
    display_name: "Playwright",
    needed,
    reasons,
    config: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-playwright"],
    },
    required_credentials: [],
    setup_instructions: {
      name: "Playwright",
      steps: [
        "Playwright MCP uses your local Playwright installation.",
        "If not installed:\n  npm install -D @playwright/test\n  npx playwright install",
        "The MCP will use your project's playwright.config.ts",
      ],
      test_command: "npx playwright --version",
    },
  };
}

/**
 * Detect Notion MCP
 */
async function detectNotionMCP(projectPath) {
  let needed = false;
  const reasons = [];

  // Check CLAUDE.md
  const claudeMd = await readFile(projectPath, ".claude/CLAUDE.md");
  if (claudeMd && claudeMd.includes("Notion")) {
    needed = true;
    reasons.push("Notion mentioned in CLAUDE.md");
  }

  // Check README
  const readme = await readFile(projectPath, "README.md");
  if (readme && readme.includes("Notion")) {
    needed = true;
    reasons.push("Notion mentioned in README.md");
  }

  // Check for Notion skill
  if (
    await directoryExists(projectPath, ".claude/skills/notion-document-manager")
  ) {
    needed = true;
    reasons.push("Notion skill present");
  }

  // Check .env for Notion credentials
  const envFile = await readFile(projectPath, ".env");
  if (
    envFile &&
    (envFile.includes("NOTION_API_KEY") || envFile.includes("NOTION_TOKEN"))
  ) {
    needed = true;
    reasons.push("Notion credentials in .env");
  }

  return {
    name: "notion",
    display_name: "Notion",
    needed,
    reasons,
    config: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-notion"],
      env: {
        NOTION_API_KEY: "${NOTION_API_KEY}",
      },
    },
    required_credentials: ["NOTION_API_KEY"],
    setup_instructions: {
      name: "Notion",
      steps: [
        "Visit https://www.notion.so/my-integrations",
        "Create new integration",
        'Copy "Internal Integration Token"',
        "Share pages/databases with the integration",
        "Add to .env:\n  NOTION_API_KEY=secret_xxxxxxxxxxxx",
      ],
      test_command: null,
    },
  };
}

/**
 * Detect Google Sheets MCP
 */
async function detectGoogleSheetsMCP(projectPath) {
  let needed = false;
  const reasons = [];

  // Check CLAUDE.md
  const claudeMd = await readFile(projectPath, ".claude/CLAUDE.md");
  if (
    claudeMd &&
    (claudeMd.includes("Google Sheets") || claudeMd.includes("spreadsheet"))
  ) {
    needed = true;
    reasons.push("Google Sheets mentioned in CLAUDE.md");
  }

  // Check package.json for Google Sheets dependencies
  const packageJson = await readPackageJson(projectPath);
  if (packageJson?.dependencies?.["googleapis"]) {
    needed = true;
    reasons.push("googleapis in dependencies");
  }

  return {
    name: "google-sheets",
    display_name: "Google Sheets",
    needed,
    reasons,
    config: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-google-sheets"],
      env: {
        GOOGLE_SHEETS_CREDENTIALS: "${GOOGLE_SHEETS_CREDENTIALS}",
        GOOGLE_SHEETS_TOKEN: "${GOOGLE_SHEETS_TOKEN}",
      },
    },
    required_credentials: ["GOOGLE_SHEETS_CREDENTIALS", "GOOGLE_SHEETS_TOKEN"],
    setup_instructions: {
      name: "Google Sheets",
      steps: [
        "Visit https://console.cloud.google.com/apis/credentials",
        "Create OAuth 2.0 Client ID (Desktop app)",
        "Download credentials.json",
        "Run authentication flow",
        "See: https://developers.google.com/sheets/api/quickstart/nodejs",
      ],
      test_command: null,
    },
  };
}

/**
 * Detect Pencil MCP
 */
async function detectPencilMCP(projectPath) {
  let needed = false;
  const reasons = [];

  // Check CLAUDE.md for design mentions
  const claudeMd = await readFile(projectPath, ".claude/CLAUDE.md");
  if (
    claudeMd &&
    (claudeMd.includes("design") ||
      claudeMd.includes("Figma") ||
      claudeMd.includes("UI") ||
      claudeMd.includes("mockup"))
  ) {
    needed = true;
    reasons.push("Design work mentioned in CLAUDE.md");
  }

  return {
    name: "pencil",
    display_name: "Pencil (Design Tool)",
    needed,
    reasons,
    config: {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-pencil"],
    },
    required_credentials: [],
    setup_instructions: {
      name: "Pencil",
      steps: [
        "Pencil MCP is a local design tool integration.",
        "No credentials required.",
      ],
      test_command: null,
    },
  };
}

/**
 * Check if credentials are available for an MCP
 */
async function checkCredentials(projectPath, detection) {
  if (detection.required_credentials.length === 0) {
    return { valid: true, required_vars: {} };
  }

  const envFile = await readFile(projectPath, ".env");
  const envVars = {};
  const foundVars = [];

  if (envFile) {
    for (const credential of detection.required_credentials) {
      const regex = new RegExp(`^${credential}=(.+)$`, "m");
      const match = envFile.match(regex);
      if (match && match[1] && match[1] !== "${" + credential + "}") {
        foundVars.push(credential);
      } else {
        envVars[credential] = "";
      }
    }
  } else {
    // No .env file, all credentials needed
    for (const credential of detection.required_credentials) {
      envVars[credential] = "";
    }
  }

  const valid = foundVars.length === detection.required_credentials.length;

  return {
    valid,
    found: foundVars,
    required_vars: envVars,
  };
}

/**
 * Generate MCP configuration files
 */
async function generateMCPFiles(projectPath, mcpResults) {
  const files = {};

  // Generate mcp.json
  files["mcp.json"] = JSON.stringify(mcpResults.mcp_config, null, 2);

  // Generate .env.example
  const envExample = Object.keys(mcpResults.env_variables)
    .map((key) => {
      const mcp = mcpResults.needs_setup.find((m) =>
        m.required_credentials?.includes(key),
      );
      return `# ${mcp?.display_name || "MCP"}\n${key}=`;
    })
    .join("\n\n");

  files[".env.example"] = envExample;

  // Generate MCP_SETUP.md
  let setupMd = "# MCP Setup Instructions\n\n";
  setupMd += `**Generated**: ${new Date().toISOString()}\n\n`;
  setupMd += "## Overview\n\n";
  setupMd += `This project uses ${mcpResults.needed.length} MCP server(s) for extended functionality.\n\n`;

  // Configured MCPs
  if (mcpResults.configured.length > 0) {
    setupMd += "## Configured MCPs\n\n";
    setupMd += "The following MCPs are ready to use (credentials found):\n\n";
    for (const mcp of mcpResults.configured) {
      setupMd += `- **${mcp.display_name}**: ${mcp.reasons.join(", ")}\n`;
    }
    setupMd += "\n";
  }

  // MCPs needing setup
  if (mcpResults.needs_setup.length > 0) {
    setupMd += "## MCPs Needing Setup\n\n";
    setupMd +=
      "The following MCPs need credentials before they can be used:\n\n";

    for (const mcp of mcpResults.needs_setup) {
      setupMd += `### ${mcp.setup_instructions.name}\n\n`;
      setupMd += `**Status**: Needs credentials\n\n`;
      setupMd += "**Steps**:\n\n";
      for (let i = 0; i < mcp.setup_instructions.steps.length; i++) {
        setupMd += `${i + 1}. ${mcp.setup_instructions.steps[i]}\n`;
      }
      setupMd += "\n";

      if (mcp.setup_instructions.test_command) {
        setupMd += "**Test Connection**:\n```bash\n";
        setupMd += mcp.setup_instructions.test_command + "\n";
        setupMd += "```\n\n";
      }

      setupMd += "---\n\n";
    }
  }

  // Not needed MCPs
  if (mcpResults.not_needed.length > 0) {
    setupMd += "## MCPs Not Needed\n\n";
    setupMd +=
      "The following MCPs were not configured (not detected as needed):\n\n";
    for (const mcp of mcpResults.not_needed) {
      setupMd += `- **${mcp.display_name}**\n`;
    }
    setupMd += "\n";
  }

  setupMd += "## Next Steps\n\n";
  setupMd += "1. Add missing credentials to `.env` file\n";
  setupMd += "2. Test MCP connections using the commands above\n";
  setupMd +=
    "3. Start using MCPs in Claude Code: `List my Jira issues` or `Show my GitHub PRs`\n";

  files["MCP_SETUP.md"] = setupMd;

  return files;
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
    return await fs.promises.readFile(path.join(projectPath, filename), "utf8");
  } catch {
    return null;
  }
}

async function readPackageJson(projectPath) {
  const content = await readFile(projectPath, "package.json");
  if (!content) return null;
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function readDockerCompose(projectPath) {
  return (
    (await readFile(projectPath, "docker-compose.yml")) ||
    (await readFile(projectPath, "docker-compose.yaml")) ||
    (await readFile(projectPath, "compose.yml"))
  );
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  detectMCPs,
  generateMCPFiles,
  checkCredentials,
};

// ============================================================================
// CLI Usage (if run directly)
// ============================================================================

if (require.main === module) {
  const projectPath = process.argv[2] || process.cwd();

  console.log(`Detecting MCPs for: ${projectPath}\n`);

  // Mock stack profile for standalone usage
  const mockStackProfile = {
    databases: [],
    testing: [],
  };

  detectMCPs(projectPath, mockStackProfile)
    .then(async (results) => {
      console.log("MCP Detection Results:\n");
      console.log(`Needed: ${results.needed.length}`);
      console.log(`Configured: ${results.configured.length}`);
      console.log(`Needs Setup: ${results.needs_setup.length}`);
      console.log(`Not Needed: ${results.not_needed.length}\n`);

      const files = await generateMCPFiles(projectPath, results);
      console.log("Generated files:");
      Object.keys(files).forEach((filename) => {
        console.log(`  - ${filename}`);
      });
    })
    .catch((error) => {
      console.error("Error:", error.message);
      process.exit(1);
    });
}
