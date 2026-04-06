import { readdir, readFile } from "fs/promises";
import { join, basename, relative } from "path";
import { logger } from "../../../utils/logger.js";

/**
 * Represents a discovered workspace in a project
 */
export interface Workspace {
  path: string;
  manifest_file: string;
  language: string;
  type: string;
  name?: string;
}

/**
 * Result of workspace detection
 */
export interface WorkspaceDetectionResult {
  workspaces: Workspace[];
  is_monorepo: boolean;
  total_workspaces: number;
  errors: string[];
}

/**
 * Map of manifest files to their language and package manager type
 */
const MANIFEST_FILES: Record<string, { language: string; type: string }> = {
  "package.json": { language: "javascript", type: "npm" },
  "yarn.lock": { language: "javascript", type: "yarn" },
  "pnpm-lock.yaml": { language: "javascript", type: "pnpm" },
  "requirements.txt": { language: "python", type: "pip" },
  Pipfile: { language: "python", type: "pipenv" },
  "pyproject.toml": { language: "python", type: "poetry" },
  "setup.py": { language: "python", type: "setuptools" },
  "go.mod": { language: "go", type: "gomod" },
  "Cargo.toml": { language: "rust", type: "cargo" },
  "pom.xml": { language: "java", type: "maven" },
  "build.gradle": { language: "java", type: "gradle" },
  "build.gradle.kts": { language: "kotlin", type: "gradle" },
  Gemfile: { language: "ruby", type: "bundler" },
  "composer.json": { language: "php", type: "composer" },
  "Package.swift": { language: "swift", type: "spm" },
  "Cargo.lock": { language: "rust", type: "cargo" },
  "mix.exs": { language: "elixir", type: "mix" },
  "rebar.config": { language: "erlang", type: "rebar" },
  "project.clj": { language: "clojure", type: "leiningen" },
  "deps.edn": { language: "clojure", type: "tools.deps" },
};

/**
 * Primary manifest files that indicate a workspace root
 * (vs. lock files which are secondary)
 */
const PRIMARY_MANIFESTS = new Set([
  "package.json",
  "requirements.txt",
  "Pipfile",
  "pyproject.toml",
  "setup.py",
  "go.mod",
  "Cargo.toml",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "Gemfile",
  "composer.json",
  "Package.swift",
  "mix.exs",
  "rebar.config",
  "project.clj",
  "deps.edn",
]);

/**
 * Directories to ignore during workspace detection
 */
const IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  "__pycache__",
  ".venv",
  "venv",
  "env",
  "vendor",
  "target",
  ".next",
  ".nuxt",
  ".cache",
  "coverage",
  ".pytest_cache",
  ".mypy_cache",
  ".tox",
  "bower_components",
  "jspm_packages",
  ".gradle",
  ".maven",
  "bin",
  "obj",
  ".terraform",
  "site-packages",
  "pkg",
  // Claude framework directories - these are generated/copied by the framework
  ".claude",
  ".claude-temp",
  ".claude-backups",
]);


/**
 * Detect workspaces in a project by finding manifest files
 *
 * @param projectPath - Absolute path to the project root
 * @param maxDepth - Maximum directory depth to scan (default: 5)
 * @param frameworkPath - Absolute path to the framework directory
 * @returns Workspace detection results
 */
export async function detectWorkspaces(
  projectPath: string,
  maxDepth: number = 5,
  frameworkPath?: string,
): Promise<WorkspaceDetectionResult> {
  const workspaces: Workspace[] = [];
  const errors: string[] = [];

  // Derive the framework directory name (same logic as agent-factory.ts)
  const frameworkDirName = frameworkPath
    ? basename(relative(projectPath, frameworkPath).split('/')[0])
    : "qubika-agentic-framework";

  // Find all manifest files
  await findManifestFiles(projectPath, 0, maxDepth, workspaces, errors, frameworkDirName);

  // Filter to primary manifests only (remove lock files if primary exists in same dir)
  const primaryWorkspaces = filterToPrimaryWorkspaces(workspaces);

  // Determine if this is a monorepo
  const isMonorepo = primaryWorkspaces.length > 1;

  // Enrich workspaces with metadata
  await enrichWorkspaces(primaryWorkspaces, errors);

  return {
    workspaces: primaryWorkspaces,
    is_monorepo: isMonorepo,
    total_workspaces: primaryWorkspaces.length,
    errors,
  };
}

/**
 * Recursively find manifest files in the project
 */
async function findManifestFiles(
  dirPath: string,
  currentDepth: number,
  maxDepth: number,
  found: Workspace[],
  errors: string[],
  frameworkDirName: string,
): Promise<void> {
  if (currentDepth > maxDepth) {
    return;
  }

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      try {
        if (entry.isDirectory()) {
          // Skip ignored directories and framework directory
          if (IGNORE_DIRS.has(entry.name) || entry.name === frameworkDirName) {
            continue;
          }

          // Recursively scan subdirectory
          await findManifestFiles(
            fullPath,
            currentDepth + 1,
            maxDepth,
            found,
            errors,
            frameworkDirName,
          );
        } else if (entry.isFile()) {
          // Check if this is a known manifest file
          const manifestInfo = MANIFEST_FILES[entry.name];

          if (manifestInfo) {
            found.push({
              path: dirPath,
              manifest_file: entry.name,
              language: manifestInfo.language,
              type: manifestInfo.type,
            });
          }
        }
      } catch (error) {
        // Permission denied or other file-level error
        const errorMsg = `Error accessing ${fullPath}: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
      }
    }
  } catch (error) {
    // Directory-level error
    const errorMsg = `Error reading directory ${dirPath}: ${error instanceof Error ? error.message : String(error)}`;
    errors.push(errorMsg);
  }
}

/**
 * Filter workspaces to only primary manifests
 * If a directory has both package.json and yarn.lock, keep only package.json
 */
function filterToPrimaryWorkspaces(workspaces: Workspace[]): Workspace[] {
  const workspacesByPath = new Map<string, Workspace[]>();

  // Group by path
  for (const ws of workspaces) {
    const existing = workspacesByPath.get(ws.path) || [];
    existing.push(ws);
    workspacesByPath.set(ws.path, existing);
  }

  // For each path, keep only primary manifests
  const filtered: Workspace[] = [];

  for (const [path, workspacesInDir] of workspacesByPath.entries()) {
    const primaryInDir = workspacesInDir.filter((ws) =>
      PRIMARY_MANIFESTS.has(ws.manifest_file),
    );

    if (primaryInDir.length > 0) {
      // Use primary manifests only
      filtered.push(...primaryInDir);
    } else {
      // No primary manifest, keep lock files (rare case)
      filtered.push(...workspacesInDir);
    }
  }

  return filtered;
}

/**
 * Enrich workspaces with additional metadata (name, etc.)
 */
async function enrichWorkspaces(
  workspaces: Workspace[],
  errors: string[],
): Promise<void> {
  for (const ws of workspaces) {
    try {
      // Try to extract name from manifest
      if (ws.manifest_file === "package.json") {
        const name = await extractNameFromPackageJson(ws.path);
        if (name) {
          ws.name = name;
        }
      } else if (ws.manifest_file === "pyproject.toml") {
        const name = await extractNameFromPyprojectToml(ws.path);
        if (name) {
          ws.name = name;
        }
      } else if (ws.manifest_file === "Cargo.toml") {
        const name = await extractNameFromCargoToml(ws.path);
        if (name) {
          ws.name = name;
        }
      } else if (ws.manifest_file === "go.mod") {
        const name = await extractNameFromGoMod(ws.path);
        if (name) {
          ws.name = name;
        }
      }

      // Fallback: use directory name
      if (!ws.name) {
        ws.name = basename(ws.path);
      }
    } catch (error) {
      // Non-fatal error, just skip enrichment
      const errorMsg = `Could not enrich workspace ${ws.path}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
    }
  }
}

/**
 * Extract package name from package.json
 */
async function extractNameFromPackageJson(
  workspacePath: string,
): Promise<string | undefined> {
  try {
    const content = await readFile(join(workspacePath, "package.json"), "utf8");
    const pkg = JSON.parse(content);
    return pkg.name;
  } catch {
    return undefined;
  }
}

/**
 * Extract project name from pyproject.toml
 */
async function extractNameFromPyprojectToml(
  workspacePath: string,
): Promise<string | undefined> {
  try {
    const content = await readFile(
      join(workspacePath, "pyproject.toml"),
      "utf8",
    );
    // Simple regex-based extraction (avoid full TOML parser dependency)
    const match = content.match(/^\s*name\s*=\s*["']([^"']+)["']/m);
    return match ? match[1] : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extract package name from Cargo.toml
 */
async function extractNameFromCargoToml(
  workspacePath: string,
): Promise<string | undefined> {
  try {
    const content = await readFile(join(workspacePath, "Cargo.toml"), "utf8");
    // Simple regex-based extraction
    const match = content.match(/^\s*name\s*=\s*["']([^"']+)["']/m);
    return match ? match[1] : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extract module name from go.mod
 */
async function extractNameFromGoMod(
  workspacePath: string,
): Promise<string | undefined> {
  try {
    const content = await readFile(join(workspacePath, "go.mod"), "utf8");
    // Extract module name from first line: "module github.com/user/project"
    const match = content.match(/^module\s+(.+)$/m);
    if (match) {
      // Use last part of module path as name
      const parts = match[1].trim().split("/");
      return parts[parts.length - 1];
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Check if a directory is likely a workspace root
 * (has a primary manifest file)
 */
export function isWorkspaceDirectory(dirPath: string): boolean {
  // This is a synchronous helper - for async detection, use detectWorkspaces
  // Here we just check if the directory name suggests it's a workspace
  const dirName = basename(dirPath);

  // Common workspace directory names
  const workspaceNames = new Set([
    "packages",
    "apps",
    "services",
    "libs",
    "modules",
    "backend",
    "frontend",
    "api",
    "web",
    "mobile",
    "shared",
    "common",
    "core",
  ]);

  return workspaceNames.has(dirName);
}

/**
 * Get supported manifest files
 */
export function getSupportedManifests(): string[] {
  return Object.keys(MANIFEST_FILES);
}

/**
 * Get language and type for a manifest file
 */
export function getManifestInfo(
  manifestFile: string,
): { language: string; type: string } | undefined {
  return MANIFEST_FILES[manifestFile];
}
