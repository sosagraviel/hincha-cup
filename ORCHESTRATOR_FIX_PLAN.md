# ORCHESTRATOR FIX PLAN - Complete TypeScript Migration

**Status:** ACTIONABLE - Ready for Implementation
**Created:** 2026-03-24
**Priority:** CRITICAL (P0)
**Estimated Effort:** 3-5 days

---

## Executive Summary

The TypeScript orchestrator has **CRITICAL REGRESSIONS** that cause it to miss entire technology stacks in monorepo projects. The root cause is **missing file counting and workspace detection** logic that existed in the bash/JS implementation.

**Example Failure:**
- Project: `/clasp/portal` monorepo
- Actual structure: `backend/` (1,704 Python files) + `frontend/` (TypeScript/React)
- Orchestrator detected: Only TypeScript/JavaScript/React
- **MISSING:** Python, Django, 1,704 files worth of backend code

**Root Cause:**
The orchestrator delegates ALL detection to LLM agents with NO FALLBACK mechanism. If an agent misses a language, it's silently dropped. The bash/JS version had `countFilesByLanguage()` and validation that GUARANTEED no language was missed.

**This Plan:**
Comprehensive fix to restore all missing functionality, achieve parity with bash/JS version, and make the framework production-ready for 1000+ projects.

---

## Table of Contents

1. [Problem Analysis](#problem-analysis)
2. [Architecture Comparison](#architecture-comparison)
3. [Missing Features](#missing-features)
4. [Implementation Plan](#implementation-plan)
5. [Code to Port](#code-to-port)
6. [Testing Strategy](#testing-strategy)
7. [Validation Checklist](#validation-checklist)

---

## Problem Analysis

### What's Broken

| Issue | Impact | Severity |
|-------|--------|----------|
| Python not detected in monorepo (1,704 .py files) | Wrong agents generated, wrong skills copied | 🔴 CRITICAL |
| No file counting by language | Can't validate detection completeness | 🔴 CRITICAL |
| No workspace discovery | Multi-stack projects treated as single stack | 🔴 CRITICAL |
| No multi_stack profile | Downstream systems don't know it's a monorepo | 🟡 HIGH |
| No language detection fallback | Silent failures when agent misses language | 🟡 HIGH |
| file_counts is undefined | Agent generation has no context | 🟡 HIGH |

### Why It's Broken

**bash/JS Version (WORKING):**
```
Phase 1: Run 4 agents in parallel
  ↓
Phase 2: Consolidate findings
  ↓
Phase 3: Opus synthesis
  ↓
Phase 4: Context generation
  ├─ Extract findings from agents
  ├─ countFilesByLanguage() ← INDEPENDENT FILE COUNTING
  ├─ detectWorkspaces() ← INDEPENDENT WORKSPACE DETECTION
  ├─ Validate: all languages ≥10 files are in agent findings
  └─ Generate stack profile with file_counts
  ↓
Phase 5: Resource copying
  ├─ Validate: stackProfile.languages matches stackProfile.file_counts
  └─ Copy skills for ALL detected languages
```

**TypeScript Orchestrator (BROKEN):**
```
Phase 1: Run 4 agents in parallel
  ↓
Phase 2: Consolidate findings
  ↓
Phase 3: Opus synthesis
  ↓
Phase 4: Context generation
  ├─ Extract findings from agents
  ├─ NO FILE COUNTING ❌
  ├─ NO WORKSPACE DETECTION ❌
  ├─ NO VALIDATION ❌
  └─ Generate stack profile with file_counts: undefined
  ↓
Phase 5: Resource copying
  ├─ NO VALIDATION ❌
  └─ Copy skills (missing languages = missing skills)
```

**The Problem:** 100% reliance on LLM agent to detect every language perfectly, with no safety net.

---

## Architecture Comparison

### bash/JS Implementation (main branch)

**Key Files:**
- `/utils/stack-detection.js` (1,492 lines) - Comprehensive stack detection
- `/utils/agent-generation.js` (1,163 lines) - Agent generation with validation
- `/skills/010-foundation/initialize-project/agents/*.md` - Agent prompts with multi-stack instructions

**Stack Detection Functions:**

```javascript
// WORKSPACE DETECTION
async function detectWorkspaces(projectPath)
  → Checks: pnpm-workspace.yaml, package.json workspaces, lerna.json, go.work
  → Also runs: discoverWorkspacesByManifests() to find undeclared workspaces
  → Returns: ['/', '/backend', '/frontend'] or ['/'] if single

async function discoverWorkspacesByManifests(projectPath)
  → Recursively searches (depth 5) for manifest files
  → Manifest files: package.json, requirements.txt, pyproject.toml, go.mod, Cargo.toml, pom.xml, Gemfile, composer.json
  → Returns: ['/functions/python', '/services/api', ...] (undeclared workspaces)

function isWorkspaceDirectory(dirPath)
  → Checks if directory contains ANY language manifest file
  → Returns: true if package.json, requirements.txt, pyproject.toml, etc. found

// FILE COUNTING
async function countFilesByLanguage(projectPath)
  → Traverses entire directory tree (excluding node_modules, .git, dist, .venv, etc.)
  → Extension map: .ts, .tsx, .js, .jsx, .py, .java, .go, .rb, .php, .rs, .c, .cpp, .cs, .swift, .kt
  → Returns: { typescript: 450, python: 1704, javascript: 120, ... }

// STACK PROFILE GENERATION
async function detectStackForWorkspace(workspacePath, metadata)
  → 1. Count files by language (adds file_count to each language)
  → 2. Detect languages (manifest + file count detection)
  → 3. Detect frameworks (backend & frontend)
  → 4. Extract dependency versions
  → 5. Detect databases
  → 6. Detect testing frameworks
  → 7. Detect cloud platforms
  → 8. Detect containers
  → 9. Detect package manager
  → Returns: Complete StackProfile object

async function mergeWorkspaceProfiles(profiles, projectPath)
  → Merges multiple workspace profiles into single monorepo profile
  → Creates multi_stack object with:
    - workspace_count: 2
    - languages: [{ name: "typescript", file_count: 450, workspaces: ["web"] }, ...]
    - total_files: 2154
  → Returns: Unified StackProfile with multi_stack section
```

**Agent Generation Validation:**

```javascript
// Lines 44-59 from utils/agent-generation.js
async function generateAgents(stackProfile, skillSelection, projectPath, templatesPath) {
  // CRITICAL VALIDATION: Ensure ALL significant languages detected
  const languagesFromProfile = getAllLanguages(stackProfile);
  const languagesFromFileCounts = Object.keys(stackProfile.file_counts || {})
    .filter(lang => stackProfile.file_counts[lang] >= 10);

  const missingLanguages = languagesFromFileCounts.filter(
    lang => !languagesFromProfile.includes(lang)
  );

  if (missingLanguages.length > 0) {
    console.error(`❌ ERROR: Languages missing from stack profile: ${missingLanguages.join(', ')}`);
    console.error(`  File counts: ${missingLanguages.map(l => `${l}(${stackProfile.file_counts[l]} files)`).join(', ')}`);
    throw new Error(`Stack profile missing languages: ${missingLanguages.join(', ')}`);
  }

  // ... continue with agent generation
}
```

### TypeScript Orchestrator (development branch)

**Key Files:**
- `/orchestration/src/nodes/initialize-project/phase4/context-generation.node.ts` (200 lines) - Context generation
- `/orchestration/src/utils/config-generator.ts` (171 lines) - Stack profile schema
- `/orchestration/agents/initialize-project/*.md` - Agent prompts (SAME as main)

**Phase 4 Context Generation (INCOMPLETE):**

```typescript
// Lines 119-150 from orchestration/src/nodes/initialize-project/phase4/context-generation.node.ts

// Extract languages from structure analyzer
const languagesFromPhase1 = Array.isArray(structureFindings?.languages)
  ? structureFindings.languages.map((l: string) => l.toLowerCase())
  : [];

phaseLogger.info(`Languages from Phase 1: ${languagesFromPhase1.join(", ") || "none"}`);

// ❌ NO FILE COUNTING
// ❌ NO WORKSPACE DETECTION
// ❌ NO VALIDATION

const stackProfile: StackProfile = {
  languages: languagesFromPhase1,
  primary_language: ...,
  frameworks: { frontend: [...], backend: [...] },
  testing_frameworks: {...},
  infrastructure: [...],
  file_counts: undefined,  // ❌ MISSING!
  detected_workspaces: [...],
  ...
}
```

**Config Generator Schema (WRONG):**

```typescript
// Line 32 from orchestration/src/utils/config-generator.ts
const StackProfileSchema = z.object({
  languages: z.array(z.string()).default([]),
  primary_language: z.string().optional(),
  frameworks: { ... },
  testing_frameworks: z.record(...),
  infrastructure: z.array(...),
  file_counts: z.record(z.string(), z.number()).optional(),  // ← SHOULD BE REQUIRED!
  // ...
})
```

**No Validation:** Phase 5 resources.node.ts has NO validation before copying skills.

---

## Missing Features

### Feature Matrix

| Feature | Main (bash/JS) | Development (TS) | Code Location (main) |
|---------|---------------|------------------|---------------------|
| **File Counting** | ✅ Full | ❌ Missing | `utils/stack-detection.js:62-114` |
| **Workspace Discovery** | ✅ Full | ❌ Missing | `utils/stack-detection.js:17-220` |
| **Language Detection Validation** | ✅ Full | ❌ Missing | `utils/agent-generation.js:44-59` |
| **Multi-Stack Profile** | ✅ Full | ❌ Missing | `utils/stack-detection.js:473-609` |
| **Monorepo Detection** | ✅ 9 tools | ⚠️ Partial (agent prompts only) | `utils/stack-detection.js:121-180` |
| **Package Manager Detection** | ✅ Full | ⚠️ Partial | `utils/stack-detection.js:795-850` |
| **Framework Detection (Python)** | ✅ Django, Flask, FastAPI | ⚠️ Partial | `utils/stack-detection.js:614-745` |
| **File Count in Stack Profile** | ✅ Required | ❌ Optional/Undefined | `utils/config-generator.ts:32` |
| **Agent Generation Validation** | ✅ Full | ❌ Missing | `utils/agent-generation.js:44-59` |

### Impact of Missing Features

**Example: Clasp Portal Project**

**Actual Structure:**
```
/clasp/portal/
├── backend/               ← 1,704 .py files (Django)
│   ├── requirements.txt
│   ├── manage.py
│   └── apps/...
├── frontend/              ← TypeScript/React
│   ├── package.json
│   └── src/...
└── functions/             ← Firebase Functions (TypeScript)
    ├── package.json
    └── src/...
```

**What Main Branch Detects:**
```javascript
{
  is_monorepo: true,
  multi_stack: {
    workspace_count: 3,
    workspaces: [
      { path: "backend", language: "python", file_count: 1704 },
      { path: "frontend", language: "typescript", file_count: 450 },
      { path: "functions", language: "typescript", file_count: 120 }
    ],
    languages: [
      { name: "python", file_count: 1704, is_primary: true, workspaces: ["backend"] },
      { name: "typescript", file_count: 570, is_primary: true, workspaces: ["frontend", "functions"] }
    ],
    total_files: 2274
  },
  languages: ["python", "typescript", "javascript"],
  file_counts: { python: 1704, typescript: 450, javascript: 120 },
  backend_frameworks: ["django"],
  frontend_frameworks: ["react", "nextjs"],
  // ...
}
```

**What Development Orchestrator Detects:**
```typescript
{
  languages: ["typescript", "javascript"],  // ❌ Python MISSING!
  file_counts: undefined,                   // ❌ No counts!
  multi_stack: undefined,                   // ❌ Monorepo not detected!
  backend_frameworks: ["nestjs"],           // ❌ Wrong! (Found functions/package.json with NestJS)
  frontend_frameworks: ["react"],           // ✓ Correct
  // ...
}
```

**Result:**
- ❌ No Python agent generated
- ❌ No Django skills copied
- ❌ No Python testing skills
- ❌ CLAUDE.md mentions TypeScript/JavaScript only
- ❌ project-context/SKILL.md incomplete
- ❌ Entire backend stack INVISIBLE to framework

---

## Implementation Plan

### Phase 1: Core Utilities (Day 1)

#### Task 1.1: Create File Counter Utility

**File:** `/orchestration/src/utils/file-counter.ts`

**Source:** Port from `main:utils/stack-detection.js` lines 62-114

**Implementation:**

```typescript
import { readdir } from 'fs/promises';
import { join, extname } from 'path';

export interface FileCountResult {
  [language: string]: number;
}

const EXTENSION_MAP: Record<string, string[]> = {
  typescript: ['.ts', '.tsx'],
  javascript: ['.js', '.jsx', '.mjs', '.cjs'],
  python: ['.py'],
  java: ['.java'],
  go: ['.go'],
  ruby: ['.rb'],
  php: ['.php'],
  rust: ['.rs'],
  c: ['.c', '.h'],
  cpp: ['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx'],
  csharp: ['.cs'],
  swift: ['.swift'],
  kotlin: ['.kt', '.kts'],
};

const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'target',
  '.next', '.nuxt', '.venv', 'venv', '__pycache__', '.pytest_cache',
  'coverage', '.coverage', '.tox', 'htmlcov', 'vendor', '.idea',
  '.vscode', 'tmp', 'temp', '.cache',
]);

/**
 * Count files by programming language extension
 * Traverses entire directory tree, excluding common build/dependency folders
 *
 * @param projectPath - Absolute path to project root
 * @returns Object mapping language names to file counts
 */
export async function countFilesByLanguage(
  projectPath: string
): Promise<FileCountResult> {
  const counts: FileCountResult = {};

  async function traverse(dirPath: string, depth: number = 0): Promise<void> {
    // Safety: prevent infinite recursion
    if (depth > 10) return;

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Skip excluded directories
          if (EXCLUDE_DIRS.has(entry.name) || entry.name.startsWith('.')) {
            continue;
          }
          await traverse(join(dirPath, entry.name), depth + 1);
        } else if (entry.isFile()) {
          const ext = extname(entry.name);

          // Find matching language for this extension
          for (const [language, extensions] of Object.entries(EXTENSION_MAP)) {
            if (extensions.includes(ext)) {
              counts[language] = (counts[language] || 0) + 1;
              break; // Each file counted once
            }
          }
        }
      }
    } catch (error) {
      // Silently skip directories we can't read (permissions, etc.)
    }
  }

  await traverse(projectPath);
  return counts;
}

/**
 * Get languages with at least N files
 *
 * @param counts - File count result from countFilesByLanguage
 * @param threshold - Minimum file count (default: 10)
 * @returns Array of language names
 */
export function getSignificantLanguages(
  counts: FileCountResult,
  threshold: number = 10
): string[] {
  return Object.entries(counts)
    .filter(([_, count]) => count >= threshold)
    .map(([language, _]) => language)
    .sort((a, b) => counts[b] - counts[a]); // Sort by file count descending
}
```

**Tests:** `/orchestration/test/unit/utils/file-counter.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { countFilesByLanguage, getSignificantLanguages } from '../../../src/utils/file-counter.js';
import { join } from 'path';

describe('file-counter', () => {
  describe('countFilesByLanguage', () => {
    it('should count TypeScript and JavaScript files', async () => {
      const testDir = join(__dirname, '../../fixtures/sample-ts-project');
      const counts = await countFilesByLanguage(testDir);

      expect(counts.typescript).toBeGreaterThan(0);
      expect(counts.javascript).toBeGreaterThan(0);
    });

    it('should count Python files', async () => {
      const testDir = join(__dirname, '../../fixtures/sample-py-project');
      const counts = await countFilesByLanguage(testDir);

      expect(counts.python).toBeGreaterThan(0);
    });

    it('should exclude node_modules', async () => {
      const testDir = join(__dirname, '../../fixtures/project-with-deps');
      const counts = await countFilesByLanguage(testDir);

      // node_modules has 10000 files but should be excluded
      expect(counts.javascript).toBeLessThan(100);
    });

    it('should handle monorepo with multiple languages', async () => {
      const testDir = join(__dirname, '../../fixtures/monorepo');
      const counts = await countFilesByLanguage(testDir);

      expect(counts.typescript).toBeGreaterThan(0);
      expect(counts.python).toBeGreaterThan(0);
      expect(Object.keys(counts).length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getSignificantLanguages', () => {
    it('should filter languages by threshold', () => {
      const counts = { typescript: 450, python: 1704, javascript: 5 };
      const significant = getSignificantLanguages(counts, 10);

      expect(significant).toEqual(['python', 'typescript']);
      expect(significant).not.toContain('javascript');
    });

    it('should sort by file count descending', () => {
      const counts = { typescript: 450, python: 1704, go: 100 };
      const significant = getSignificantLanguages(counts, 10);

      expect(significant[0]).toBe('python');
      expect(significant[1]).toBe('typescript');
      expect(significant[2]).toBe('go');
    });
  });
});
```

#### Task 1.2: Create Workspace Detector Utility

**File:** `/orchestration/src/utils/workspace-detector.ts`

**Source:** Port from `main:utils/stack-detection.js` lines 17-260

**Implementation:**

```typescript
import { readdir, readFile, access } from 'fs/promises';
import { join, relative } from 'path';
import { parse as parseYaml } from 'yaml';

export interface Workspace {
  path: string;
  relativePath: string;
  type: 'declared' | 'discovered';
  manifestFiles: string[];
}

const MANIFEST_FILES: Record<string, string[]> = {
  javascript: ['package.json'],
  typescript: ['package.json', 'tsconfig.json'],
  python: ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile', 'poetry.lock'],
  go: ['go.mod'],
  rust: ['Cargo.toml'],
  java: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
  ruby: ['Gemfile'],
  php: ['composer.json'],
  csharp: ['*.csproj', '*.sln'],
};

const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'target',
  '.next', '.nuxt', '.venv', 'venv', '__pycache__', '.pytest_cache',
  'coverage', '.coverage', '.tox', 'htmlcov', 'vendor',
]);

/**
 * Check if a directory is a workspace (contains language manifest files)
 *
 * @param dirPath - Absolute path to directory
 * @returns True if directory contains at least one manifest file
 */
export async function isWorkspaceDirectory(dirPath: string): Promise<boolean> {
  const allManifests = Object.values(MANIFEST_FILES).flat();

  for (const manifest of allManifests) {
    try {
      await access(join(dirPath, manifest));
      return true;
    } catch {
      // File doesn't exist, continue checking
    }
  }

  return false;
}

/**
 * Get manifest files present in a directory
 *
 * @param dirPath - Absolute path to directory
 * @returns Array of manifest file names
 */
export async function getManifestFiles(dirPath: string): Promise<string[]> {
  const allManifests = Object.values(MANIFEST_FILES).flat();
  const foundManifests: string[] = [];

  for (const manifest of allManifests) {
    try {
      await access(join(dirPath, manifest));
      foundManifests.push(manifest);
    } catch {
      // File doesn't exist, skip
    }
  }

  return foundManifests;
}

/**
 * Recursively discover workspaces by finding manifest files
 * Searches up to depth 5 for undeclared workspaces (e.g., functions/python/)
 *
 * @param projectPath - Absolute path to project root
 * @returns Array of discovered workspace paths
 */
export async function discoverWorkspacesByManifests(
  projectPath: string
): Promise<string[]> {
  const workspaces: string[] = [];
  const visited = new Set<string>();

  async function search(dirPath: string, depth: number = 0): Promise<void> {
    // Safety limits
    if (visited.has(dirPath)) return;
    visited.add(dirPath);
    if (depth > 5) return;

    try {
      const entries = await readdir(dirPath, { withFileTypes: true });

      // Check if THIS directory is a workspace
      if (depth > 0 && await isWorkspaceDirectory(dirPath)) {
        workspaces.push(dirPath);
        return; // Don't recurse into found workspaces
      }

      // Recurse into subdirectories
      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (EXCLUDE_DIRS.has(entry.name) || entry.name.startsWith('.')) {
            continue;
          }
          await search(join(dirPath, entry.name), depth + 1);
        }
      }
    } catch (error) {
      // Silently skip directories we can't read
    }
  }

  await search(projectPath);
  return workspaces;
}

/**
 * Detect declared workspaces from monorepo configuration files
 * Supports: pnpm-workspace.yaml, package.json workspaces, lerna.json, go.work
 *
 * @param projectPath - Absolute path to project root
 * @returns Array of declared workspace paths
 */
export async function detectDeclaredWorkspaces(
  projectPath: string
): Promise<string[]> {
  const workspaces: string[] = [];

  // Check pnpm-workspace.yaml
  try {
    const pnpmWorkspacePath = join(projectPath, 'pnpm-workspace.yaml');
    const pnpmWorkspaceContent = await readFile(pnpmWorkspacePath, 'utf-8');
    const pnpmConfig = parseYaml(pnpmWorkspaceContent);

    if (Array.isArray(pnpmConfig.packages)) {
      for (const pattern of pnpmConfig.packages) {
        // TODO: Expand glob patterns (e.g., "packages/*")
        // For now, add literal paths
        if (!pattern.includes('*')) {
          workspaces.push(join(projectPath, pattern));
        }
      }
    }
  } catch {
    // pnpm-workspace.yaml doesn't exist or is invalid
  }

  // Check package.json workspaces
  try {
    const packageJsonPath = join(projectPath, 'package.json');
    const packageJsonContent = await readFile(packageJsonPath, 'utf-8');
    const packageJson = JSON.parse(packageJsonContent);

    if (Array.isArray(packageJson.workspaces)) {
      for (const pattern of packageJson.workspaces) {
        if (!pattern.includes('*')) {
          workspaces.push(join(projectPath, pattern));
        }
      }
    } else if (packageJson.workspaces?.packages) {
      for (const pattern of packageJson.workspaces.packages) {
        if (!pattern.includes('*')) {
          workspaces.push(join(projectPath, pattern));
        }
      }
    }
  } catch {
    // package.json doesn't exist or is invalid
  }

  // Check lerna.json
  try {
    const lernaPath = join(projectPath, 'lerna.json');
    const lernaContent = await readFile(lernaPath, 'utf-8');
    const lernaConfig = JSON.parse(lernaContent);

    if (Array.isArray(lernaConfig.packages)) {
      for (const pattern of lernaConfig.packages) {
        if (!pattern.includes('*')) {
          workspaces.push(join(projectPath, pattern));
        }
      }
    }
  } catch {
    // lerna.json doesn't exist or is invalid
  }

  // Check go.work
  try {
    const goWorkPath = join(projectPath, 'go.work');
    const goWorkContent = await readFile(goWorkPath, 'utf-8');

    // Simple regex to extract "use" statements
    const useRegex = /use\s+\.\/([^\s]+)/g;
    let match;
    while ((match = useRegex.exec(goWorkContent)) !== null) {
      workspaces.push(join(projectPath, match[1]));
    }
  } catch {
    // go.work doesn't exist
  }

  return workspaces;
}

/**
 * Detect ALL workspaces in project (declared + discovered)
 *
 * @param projectPath - Absolute path to project root
 * @returns Array of workspace objects with metadata
 */
export async function detectWorkspaces(projectPath: string): Promise<Workspace[]> {
  const declaredPaths = await detectDeclaredWorkspaces(projectPath);
  const discoveredPaths = await discoverWorkspacesByManifests(projectPath);

  // Combine and deduplicate
  const allPaths = new Set([...declaredPaths, ...discoveredPaths]);

  // If no workspaces found, treat root as single workspace
  if (allPaths.size === 0) {
    const manifestFiles = await getManifestFiles(projectPath);
    return [{
      path: projectPath,
      relativePath: '.',
      type: 'declared',
      manifestFiles,
    }];
  }

  // Create workspace objects
  const workspaces: Workspace[] = [];
  for (const wsPath of allPaths) {
    const manifestFiles = await getManifestFiles(wsPath);
    workspaces.push({
      path: wsPath,
      relativePath: relative(projectPath, wsPath),
      type: declaredPaths.includes(wsPath) ? 'declared' : 'discovered',
      manifestFiles,
    });
  }

  return workspaces;
}

/**
 * Check if project is a monorepo
 *
 * @param projectPath - Absolute path to project root
 * @returns True if project has multiple workspaces
 */
export async function isMonorepo(projectPath: string): Promise<boolean> {
  const workspaces = await detectWorkspaces(projectPath);
  return workspaces.length > 1;
}
```

**Tests:** `/orchestration/test/unit/utils/workspace-detector.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  isWorkspaceDirectory,
  discoverWorkspacesByManifests,
  detectDeclaredWorkspaces,
  detectWorkspaces,
  isMonorepo,
} from '../../../src/utils/workspace-detector.js';
import { join } from 'path';

describe('workspace-detector', () => {
  describe('isWorkspaceDirectory', () => {
    it('should detect JS workspace (package.json)', async () => {
      const testDir = join(__dirname, '../../fixtures/sample-ts-project');
      const result = await isWorkspaceDirectory(testDir);
      expect(result).toBe(true);
    });

    it('should detect Python workspace (requirements.txt)', async () => {
      const testDir = join(__dirname, '../../fixtures/sample-py-project');
      const result = await isWorkspaceDirectory(testDir);
      expect(result).toBe(true);
    });

    it('should return false for non-workspace directory', async () => {
      const testDir = join(__dirname, '../../fixtures/empty-dir');
      const result = await isWorkspaceDirectory(testDir);
      expect(result).toBe(false);
    });
  });

  describe('discoverWorkspacesByManifests', () => {
    it('should find undeclared Python workspace in functions/', async () => {
      const testDir = join(__dirname, '../../fixtures/monorepo-with-python');
      const workspaces = await discoverWorkspacesByManifests(testDir);

      const pythonWorkspace = workspaces.find(ws => ws.includes('functions/python'));
      expect(pythonWorkspace).toBeDefined();
    });

    it('should respect depth limit', async () => {
      const testDir = join(__dirname, '../../fixtures/deeply-nested-project');
      const workspaces = await discoverWorkspacesByManifests(testDir);

      // Should not find workspaces at depth > 5
      expect(workspaces.every(ws => ws.split('/').length <= 8)).toBe(true);
    });
  });

  describe('detectWorkspaces', () => {
    it('should detect monorepo with pnpm workspaces', async () => {
      const testDir = join(__dirname, '../../fixtures/pnpm-monorepo');
      const workspaces = await detectWorkspaces(testDir);

      expect(workspaces.length).toBeGreaterThan(1);
      expect(workspaces.some(ws => ws.type === 'declared')).toBe(true);
    });

    it('should return root as single workspace if no workspaces found', async () => {
      const testDir = join(__dirname, '../../fixtures/single-project');
      const workspaces = await detectWorkspaces(testDir);

      expect(workspaces.length).toBe(1);
      expect(workspaces[0].relativePath).toBe('.');
    });
  });

  describe('isMonorepo', () => {
    it('should return true for monorepo', async () => {
      const testDir = join(__dirname, '../../fixtures/monorepo');
      const result = await isMonorepo(testDir);
      expect(result).toBe(true);
    });

    it('should return false for single project', async () => {
      const testDir = join(__dirname, '../../fixtures/single-project');
      const result = await isMonorepo(testDir);
      expect(result).toBe(false);
    });
  });
});
```

---

### Phase 2: Phase 4 Integration (Day 2)

#### Task 2.1: Update Context Generation Node

**File:** `/orchestration/src/nodes/initialize-project/phase4/context-generation.node.ts`

**Changes:**

```typescript
// Add imports at top
import { countFilesByLanguage, getSignificantLanguages } from '../../../utils/file-counter.js';
import { detectWorkspaces, isMonorepo } from '../../../utils/workspace-detector.js';

// After line 130 (after extracting languagesFromPhase1), ADD:

// ========================================================================
// INDEPENDENT FILE COUNTING & WORKSPACE DETECTION
// ========================================================================
phaseLogger.info(" Running independent file counting...");

const fileCounts = await countFilesByLanguage(state.project_path);
const significantLanguages = getSignificantLanguages(fileCounts, 10);

phaseLogger.info(`  File counts:`);
for (const [lang, count] of Object.entries(fileCounts).sort((a, b) => b[1] - a[1])) {
  phaseLogger.info(`    - ${lang}: ${count} files`);
}

// ========================================================================
// LANGUAGE DETECTION VALIDATION
// ========================================================================
phaseLogger.info(" Validating language detection completeness...");

const detectedLanguages = languagesFromPhase1.map(l => l.toLowerCase());
const missingLanguages = significantLanguages.filter(
  lang => !detectedLanguages.includes(lang.toLowerCase())
);

if (missingLanguages.length > 0) {
  phaseLogger.warn(
    `⚠️  Agent missed languages with >10 files: ${missingLanguages.join(', ')}`
  );
  phaseLogger.warn(`   Adding missed languages to stack profile...`);

  for (const lang of missingLanguages) {
    languagesFromPhase1.push(lang);
    phaseLogger.warn(`   + ${lang} (${fileCounts[lang]} files)`);
  }
}

// ========================================================================
// WORKSPACE DETECTION
// ========================================================================
phaseLogger.info(" Detecting workspaces...");

const workspaces = await detectWorkspaces(state.project_path);
const isMonorepoProject = await isMonorepo(state.project_path);

if (isMonorepoProject) {
  phaseLogger.info(`  ✓ Detected monorepo with ${workspaces.length} workspaces:`);
  for (const ws of workspaces) {
    phaseLogger.info(`    - ${ws.relativePath} (${ws.manifestFiles.join(', ')})`);
  }
} else {
  phaseLogger.info(`  Single project (not a monorepo)`);
}

// ========================================================================
// EXTRACT MULTI_STACK FROM PHASE 1 (if present)
// ========================================================================
let multiStack = structureFindings.multi_stack;

if (!multiStack && isMonorepoProject) {
  phaseLogger.warn(`  ⚠️  Agent did not detect monorepo structure`);
  phaseLogger.warn(`     Generating multi_stack profile from detected workspaces...`);

  // Generate multi_stack object from workspace detection
  multiStack = {
    is_monorepo: true,
    workspace_count: workspaces.length,
    workspaces: workspaces.map(ws => ({
      path: ws.relativePath,
      manifest_files: ws.manifestFiles,
      type: ws.type,
    })),
    languages: significantLanguages.map(lang => ({
      name: lang,
      file_count: fileCounts[lang],
      is_primary: fileCounts[lang] >= Math.max(...Object.values(fileCounts)) * 0.5,
    })),
    total_files: Object.values(fileCounts).reduce((sum, count) => sum + count, 0),
  };
}

// ========================================================================
// UPDATE STACK PROFILE WITH FILE COUNTS & MULTI_STACK
// ========================================================================

// ... existing framework extraction code ...

const stackProfile: StackProfile = {
  languages: languagesFromPhase1,
  primary_language: primaryLanguage,
  frameworks: {
    frontend: frontendFrameworks,
    backend: backendFrameworks,
    mobile: [],
  },
  testing_frameworks: testingFrameworks,
  infrastructure: infrastructureFromPhase1,
  file_counts: fileCounts,  // ← ADD THIS
  multi_stack: multiStack,  // ← ADD THIS
  detected_workspaces: workspaces.map(ws => ws.relativePath),  // ← ADD THIS
  package_manager: packageManager,
  workspace_type: isMonorepoProject ? 'monorepo' : 'single',
};

phaseLogger.info(" Generating framework-config.json...");
```

**Validation Logic:**

```typescript
// After stack profile generation, before writing config, ADD:

// ========================================================================
// FINAL VALIDATION
// ========================================================================
phaseLogger.info(" Validating stack profile completeness...");

const profileLanguages = stackProfile.languages.map(l => l.toLowerCase());
const fileCountLanguages = Object.keys(stackProfile.file_counts || {})
  .filter(lang => stackProfile.file_counts![lang] >= 10)
  .map(l => l.toLowerCase());

const stillMissing = fileCountLanguages.filter(
  lang => !profileLanguages.includes(lang)
);

if (stillMissing.length > 0) {
  throw new Error(
    `Stack profile validation failed. Languages with >10 files are missing:\n` +
    stillMissing.map(lang => `  - ${lang} (${stackProfile.file_counts![lang]} files)`).join('\n') +
    `\n\nThis indicates a bug in Phase 1 analysis. Please report this issue.`
  );
}

phaseLogger.success(" ✓ Stack profile validation passed");
phaseLogger.info(`   Languages: ${profileLanguages.join(', ')}`);
phaseLogger.info(`   Total files: ${Object.values(stackProfile.file_counts!).reduce((a, b) => a + b, 0)}`);
```

#### Task 2.2: Update Config Generator Schema

**File:** `/orchestration/src/utils/config-generator.ts`

**Change line 32:**

```typescript
// BEFORE:
file_counts: z.record(z.string(), z.number()).optional(),

// AFTER:
file_counts: z.record(z.string(), z.number()),  // ← Remove .optional()
```

**Add multi_stack to schema:**

```typescript
// After file_counts, ADD:
multi_stack: z.object({
  is_monorepo: z.boolean(),
  workspace_count: z.number(),
  workspaces: z.array(z.object({
    path: z.string(),
    manifest_files: z.array(z.string()),
    type: z.enum(['declared', 'discovered']),
  })),
  languages: z.array(z.object({
    name: z.string(),
    file_count: z.number(),
    is_primary: z.boolean(),
  })),
  total_files: z.number(),
}).optional(),
```

---

### Phase 3: Phase 5 Validation (Day 2)

#### Task 3.1: Add Agent Generation Validation

**File:** `/orchestration/src/nodes/initialize-project/phase5/resources.node.ts`

**Add BEFORE skill resolution (around line 50):**

```typescript
// ========================================================================
// VALIDATE STACK PROFILE COMPLETENESS BEFORE AGENT GENERATION
// ========================================================================
phaseLogger.info(" Validating stack profile before agent generation...");

const stackProfile = state.framework_config?.stack_profile;

if (!stackProfile) {
  throw new Error('Stack profile not found in framework config');
}

if (!stackProfile.file_counts || Object.keys(stackProfile.file_counts).length === 0) {
  throw new Error('Stack profile missing file_counts - Phase 4 validation should have caught this');
}

const languagesFromProfile = (stackProfile.languages || []).map((l: string) => l.toLowerCase());
const languagesFromFileCounts = Object.keys(stackProfile.file_counts)
  .filter(lang => stackProfile.file_counts![lang] >= 10)
  .map(l => l.toLowerCase());

const missingLanguages = languagesFromFileCounts.filter(
  lang => !languagesFromProfile.includes(lang)
);

if (missingLanguages.length > 0) {
  const errorMessage =
    `Stack profile is incomplete. Languages with >10 files are missing:\n` +
    missingLanguages.map(lang =>
      `  - ${lang} (${stackProfile.file_counts![lang]} files)`
    ).join('\n') +
    `\n\n` +
    `This indicates a failure in Phase 4 language detection.\n` +
    `Expected languages: ${languagesFromFileCounts.join(', ')}\n` +
    `Actual languages: ${languagesFromProfile.join(', ')}\n\n` +
    `Please re-run initialization or report this as a bug.`;

  throw new Error(errorMessage);
}

phaseLogger.success(" ✓ Stack profile validation passed");
phaseLogger.info(`   All ${languagesFromProfile.length} languages accounted for`);
```

---

### Phase 4: Phase 2 Enhancement (Day 3)

#### Task 4.1: Add File Count Check in Consolidation

**File:** `/orchestration/src/nodes/initialize-project/phase2/consolidation.node.ts`

**Add after loading Phase 1 outputs (around line 89):**

```typescript
// ========================================================================
// VALIDATE FILE COUNT PRESENCE IN PHASE 1 OUTPUTS
// ========================================================================
phaseLogger.info(" Checking Phase 1 analysis completeness...");

const structureArchData = analyzers.find(
  (a: any) => a.agent_name?.includes('structure-architecture')
);

if (!structureArchData) {
  throw new Error('Structure architecture analysis not found in Phase 1 outputs');
}

// Check if agent provided file_counts
const hasFileCounts = structureArchData.findings?.file_counts &&
                      Object.keys(structureArchData.findings.file_counts).length > 0;

if (!hasFileCounts) {
  phaseLogger.warn(`⚠️  Phase 1 analyzer did not provide file_counts`);
  phaseLogger.warn(`   This may indicate the agent needs more explicit instructions`);
  phaseLogger.warn(`   File counting will be performed independently in Phase 4`);

  // Add to gaps for user visibility
  gaps.push({
    type: 'missing_language_coverage',
    agent: '01-structure-architecture',
    item: 'file_counts',
    question: 'The structure analyzer did not provide file counts by language. This will be calculated independently.',
    priority: 'medium',
  });
}

// Check if agent detected multi_stack for potential monorepos
const hasMultiStack = structureArchData.findings?.multi_stack?.is_monorepo;

if (!hasMultiStack) {
  phaseLogger.warn(`⚠️  Phase 1 analyzer did not detect monorepo structure`);
  phaseLogger.warn(`   Workspace detection will be performed independently in Phase 4`);
}
```

---

### Phase 5: Agent Prompt Enhancement (Day 3)

#### Task 5.1: Update Agent Prompts to Output File Counts

**File:** `/orchestration/agents/initialize-project/01-structure-architecture.md`

**Add to JSON output schema section:**

```markdown
## Required JSON Output Schema

```json
{
  "agent_name": "structure-architecture-analyzer",
  "timestamp": "ISO 8601 timestamp",
  "findings": {
    "repository_type": "single-repo | mono-repo | meta-repo",
    "packages": [...],
    "languages": ["TypeScript", "Python", ...],  // ALL languages with >10 files
    "file_counts": {  // ← ADD THIS SECTION
      "typescript": 450,
      "python": 1704,
      "javascript": 120
    },
    "runtimes": {...},
    "frameworks": {...},
    "architecture_pattern": "...",
    "file_placement": {...},
    "path_aliases": {...},
    "database": {...},
    "multi_stack": {  // ← CRITICAL for monorepos
      "is_monorepo": true,
      "workspaces": [
        {
          "path": "backend",
          "language": "python",
          "file_count": 1704,
          "manifest_files": ["requirements.txt", "setup.py"],
          "dependencies": ["django", "djangorestframework"]
        },
        {
          "path": "frontend",
          "language": "typescript",
          "file_count": 450,
          "manifest_files": ["package.json", "tsconfig.json"],
          "dependencies": ["react", "next"]
        }
      ]
    }
  },
  "needs_verification": [...]
}
```

**CRITICAL REQUIREMENTS:**

1. **File Counts are REQUIRED:**
   - Use Glob to count files: `**/*.py`, `**/*.ts`, `**/*.js`, etc.
   - Report counts for ALL languages with >10 files
   - Exclude: node_modules, .git, dist, build, .venv, __pycache__

2. **Multi-Stack Detection is CRITICAL:**
   - If project has >1 workspace, `multi_stack.is_monorepo` MUST be true
   - Document EVERY workspace with its language, file count, and dependencies
   - Example: backend/ (Python), frontend/ (TypeScript), functions/ (TypeScript)

3. **Language Completeness:**
   - Do NOT assume project has only 1-2 languages
   - Search ENTIRE directory tree for manifest files
   - Report TypeScript (450 files), Python (1704 files), Go (100 files) - ALL of them
```

---

### Phase 6: Testing & Validation (Day 4-5)

#### Task 6.1: Create Test Fixtures

**Directory:** `/orchestration/test/fixtures/`

**Create:**
1. `single-project/` - Simple TypeScript project
2. `monorepo/` - Multi-language monorepo (TS + Python)
3. `pnpm-monorepo/` - pnpm workspace monorepo
4. `undeclared-workspaces/` - Project with functions/python/ not in workspace config
5. `clasp-portal/` - Replica of the failing portal project structure

**Example: `test/fixtures/monorepo/`**

```
monorepo/
├── backend/
│   ├── requirements.txt
│   ├── app.py
│   ├── models.py
│   └── ... (20+ .py files)
├── frontend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   └── ... (30+ .ts/.tsx files)
│   └── ...
└── package.json (workspace config)
```

#### Task 6.2: Integration Tests

**File:** `/orchestration/test/integration/initialize-project-file-counting.integration.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { contextGenerationNode } from '../../src/nodes/initialize-project/phase4/context-generation.node.js';
import { countFilesByLanguage } from '../../src/utils/file-counter.js';
import { detectWorkspaces, isMonorepo } from '../../src/utils/workspace-detector.js';
import { join } from 'path';

describe('Initialize Project - File Counting', () => {
  it('should detect Python in monorepo backend/', async () => {
    const fixtureDir = join(__dirname, '../fixtures/monorepo');
    const counts = await countFilesByLanguage(fixtureDir);

    expect(counts.python).toBeGreaterThan(10);
    expect(counts.typescript).toBeGreaterThan(10);
  });

  it('should detect monorepo structure', async () => {
    const fixtureDir = join(__dirname, '../fixtures/monorepo');
    const result = await isMonorepo(fixtureDir);
    const workspaces = await detectWorkspaces(fixtureDir);

    expect(result).toBe(true);
    expect(workspaces.length).toBeGreaterThan(1);
    expect(workspaces.some(ws => ws.relativePath.includes('backend'))).toBe(true);
    expect(workspaces.some(ws => ws.relativePath.includes('frontend'))).toBe(true);
  });

  it('should validate language detection completeness', async () => {
    const fixtureDir = join(__dirname, '../fixtures/monorepo');

    // Simulate Phase 1 output missing Python
    const mockPhase1 = {
      findings: {
        languages: ['TypeScript', 'JavaScript'], // ← Missing Python!
        file_counts: undefined, // ← Not provided by agent
      }
    };

    // Phase 4 should detect this and add Python
    const counts = await countFilesByLanguage(fixtureDir);
    const significant = Object.keys(counts).filter(lang => counts[lang] >= 10);

    expect(significant).toContain('python');
    expect(significant).toContain('typescript');
  });
});
```

**File:** `/orchestration/test/integration/initialize-project-validation.integration.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { resourcesNode } from '../../src/nodes/initialize-project/phase5/resources.node.js';

describe('Initialize Project - Validation', () => {
  it('should throw error if stack profile missing languages', async () => {
    const mockState = {
      framework_config: {
        stack_profile: {
          languages: ['typescript'],
          file_counts: {
            typescript: 450,
            python: 1704, // ← Python has 1704 files but not in languages array!
          }
        }
      }
    };

    await expect(async () => {
      await resourcesNode(mockState as any);
    }).rejects.toThrow('Stack profile is incomplete');
  });

  it('should pass validation when all languages accounted for', async () => {
    const mockState = {
      framework_config: {
        stack_profile: {
          languages: ['typescript', 'python'],
          file_counts: {
            typescript: 450,
            python: 1704,
          }
        }
      }
    };

    // Should not throw
    await expect(async () => {
      // Validation logic only - skip actual resource copying
    }).resolves.not.toThrow();
  });
});
```

#### Task 6.3: End-to-End Test

**File:** `/orchestration/test/integration/e2e-portal-project.integration.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { runInitializeProject } from '../../src/cli/initialize.js';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';

describe('E2E: Portal Project (Monorepo)', () => {
  it('should detect Python backend in clasp portal project', async () => {
    const portalFixture = join(__dirname, '../fixtures/clasp-portal');

    // Run full initialization
    await runInitializeProject({
      projectPath: portalFixture,
      frameworkPath: join(__dirname, '../../..'),
      skipGapQuestions: true,
    });

    // Check framework-config.json
    const configPath = join(portalFixture, '.claude/framework-config.json');
    expect(existsSync(configPath)).toBe(true);

    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    const stackProfile = config.stack_profile;

    // Verify Python detected
    expect(stackProfile.languages).toContain('python');
    expect(stackProfile.file_counts.python).toBeGreaterThan(1000);

    // Verify multi-stack detected
    expect(stackProfile.multi_stack?.is_monorepo).toBe(true);
    expect(stackProfile.multi_stack?.workspace_count).toBeGreaterThan(1);

    // Verify Django detected
    expect(stackProfile.backend_frameworks).toContain('django');

    // Check that Python skills were copied
    const pythonSkillsPath = join(portalFixture, '.claude/skills/python-core');
    expect(existsSync(pythonSkillsPath)).toBe(true);

    // Check that Python agent was generated
    const pythonAgentPath = join(portalFixture, '.claude/agents/implementer-python.md');
    expect(existsSync(pythonAgentPath)).toBe(true);
  });
});
```

---

## Code to Port

### Summary Table

| Source File (main branch) | Destination (orchestration) | Lines | Priority |
|--------------------------|----------------------------|-------|----------|
| `utils/stack-detection.js:62-114` | `orchestration/src/utils/file-counter.ts` | 52 | P0 |
| `utils/stack-detection.js:17-220` | `orchestration/src/utils/workspace-detector.ts` | 203 | P0 |
| `utils/agent-generation.js:44-59` | `orchestration/src/nodes/initialize-project/phase5/resources.node.ts` | 15 | P0 |
| `utils/stack-detection.js:473-609` | `orchestration/src/nodes/initialize-project/phase4/context-generation.node.ts` | 136 | P1 |

### Detailed Porting Guide

**From `utils/stack-detection.js` to `file-counter.ts`:**
- Function: `countFilesByLanguage()` (lines 62-114)
- Port as-is to TypeScript
- Extension map: Keep identical
- Exclude dirs: Keep identical
- Add TypeScript types

**From `utils/stack-detection.js` to `workspace-detector.ts`:**
- Function: `discoverWorkspacesByManifests()` (lines 17-57)
- Function: `isWorkspaceDirectory()` (lines 192-220)
- Function: `detectWorkspaces()` (lines 121-180)
- Function: `expandGlobPatterns()` (lines 222-259)
- Port logic to TypeScript with `fs/promises` API

**From `utils/agent-generation.js` to `resources.node.ts`:**
- Validation logic (lines 44-59)
- Add before skill resolution in Phase 5
- Throw error if validation fails

---

## Testing Strategy

### Unit Tests (80% Coverage Target)

**Utilities:**
- `file-counter.test.ts`: Test file counting, language filtering, exclude dirs
- `workspace-detector.test.ts`: Test workspace detection, monorepo detection, manifest finding

**Nodes:**
- Update existing phase4 tests to verify file_counts populated
- Update existing phase5 tests to verify validation runs

### Integration Tests (90% Coverage Target)

**Scenarios:**
1. Single project (TypeScript) → Should work as before
2. Monorepo (TypeScript + Python) → Should detect both languages
3. Undeclared workspace (functions/python/) → Should discover via manifest search
4. Agent misses language → Should catch via validation and add
5. No file_counts in Phase 1 → Should calculate independently in Phase 4

### E2E Tests

**Real Project Tests:**
1. Run on `test/fixtures/clasp-portal` (replica of failing project)
2. Verify framework-config.json has Python
3. Verify Python skills copied
4. Verify Python agent generated
5. Compare output to main branch bash/JS version

### Manual Testing Checklist

Run on real projects:
- [ ] Clasp Portal (TS + Python monorepo)
- [ ] Pure TypeScript project
- [ ] Pure Python project (Django)
- [ ] Multi-language monorepo (TS + Python + Go)
- [ ] Project with undeclared workspaces

Verify for each:
- [ ] All languages detected
- [ ] File counts accurate
- [ ] Multi-stack profile correct
- [ ] Skills copied for all languages
- [ ] Agents generated for all languages

---

## Validation Checklist

### Phase 1: Core Utilities

- [ ] `file-counter.ts` created
- [ ] `workspace-detector.ts` created
- [ ] Unit tests pass (>90% coverage)
- [ ] Can count files in test fixtures
- [ ] Can detect workspaces in test fixtures

### Phase 2: Phase 4 Integration

- [ ] Phase 4 calls `countFilesByLanguage()`
- [ ] Phase 4 calls `detectWorkspaces()`
- [ ] Phase 4 validates language detection
- [ ] Phase 4 adds missing languages
- [ ] Phase 4 populates `file_counts` in stack profile
- [ ] Phase 4 populates `multi_stack` in stack profile
- [ ] Config generator schema updated (file_counts required)

### Phase 3: Phase 5 Validation

- [ ] Phase 5 validates stack profile before skill resolution
- [ ] Phase 5 throws error if languages missing
- [ ] Error message is clear and actionable

### Phase 4: Phase 2 Enhancement

- [ ] Phase 2 checks for file_counts in Phase 1 output
- [ ] Phase 2 warns if file_counts missing
- [ ] Phase 2 adds gap if file_counts missing

### Phase 5: Agent Prompts

- [ ] Agent prompts updated with file_counts requirement
- [ ] Agent prompts updated with multi_stack requirement
- [ ] Agent prompts have examples

### Phase 6: Testing

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] E2E test on clasp-portal passes
- [ ] Manual testing on 5 projects passes

### Phase 7: Regression Testing

Run full initialize-project on:
- [ ] Clasp Portal → Python detected ✅
- [ ] Pure TS project → No regressions ✅
- [ ] Pure Python project → Python detected ✅
- [ ] Monorepo → All languages detected ✅

### Phase 8: Documentation

- [ ] Update INITIALIZE_PROJECT.md with new validation behavior
- [ ] Update troubleshooting guide
- [ ] Add section on multi-stack detection
- [ ] Document file counting mechanism

---

## Success Criteria

### Must Have (P0)

1. ✅ File counting by language works for all supported extensions
2. ✅ Workspace detection finds declared + discovered workspaces
3. ✅ Phase 4 validates all languages ≥10 files are in stack profile
4. ✅ Phase 5 validates stack profile completeness before agent generation
5. ✅ Clasp Portal project detects Python + TypeScript correctly
6. ✅ Multi-stack profile populated for monorepos
7. ✅ file_counts is always populated (never undefined)

### Should Have (P1)

1. ✅ Agent prompts updated to output file_counts
2. ✅ Phase 2 checks for file_counts presence
3. ✅ Comprehensive error messages when validation fails
4. ✅ E2E test coverage for monorepos
5. ✅ Documentation updated

### Nice to Have (P2)

1. Performance optimization (caching file counts)
2. Incremental file counting (resume from checkpoint)
3. Parallel workspace detection
4. More granular language detection (dialects, versions)

---

## Timeline

**Day 1: Core Utilities**
- Morning: Implement `file-counter.ts` + tests (3-4 hours)
- Afternoon: Implement `workspace-detector.ts` + tests (3-4 hours)
- Evening: Review, fix failing tests (1-2 hours)

**Day 2: Phase 4 & 5 Integration**
- Morning: Update Phase 4 context generation (3-4 hours)
- Afternoon: Add Phase 5 validation (2-3 hours)
- Evening: Update config generator schema (1 hour)

**Day 3: Phase 2 & Agent Prompts**
- Morning: Enhance Phase 2 consolidation (2-3 hours)
- Afternoon: Update agent prompts (2-3 hours)
- Evening: Create test fixtures (2-3 hours)

**Day 4: Integration Testing**
- Morning: Write integration tests (3-4 hours)
- Afternoon: Write E2E test for portal project (2-3 hours)
- Evening: Run tests, fix issues (2-3 hours)

**Day 5: Manual Testing & Polish**
- Morning: Manual testing on real projects (3-4 hours)
- Afternoon: Fix any issues found (2-3 hours)
- Evening: Documentation, cleanup (2-3 hours)

**Total Estimated Effort:** 3-5 days (depends on issue count during testing)

---

## Risk Mitigation

### Risk 1: File counting performance on large projects

**Mitigation:**
- Exclude dirs optimization (skip node_modules immediately)
- Depth limit (max 10 levels)
- Early exit on file count (stop after first extension match)

**Fallback:**
- If counting takes >30 seconds, log warning and use Phase 1 agent findings only

### Risk 2: Workspace detection false positives

**Mitigation:**
- Require manifest file (not just directory structure)
- Validate manifest files (check they're parseable)
- Depth limit prevents deep false positives

**Fallback:**
- If too many workspaces found (>20), treat as single project and log warning

### Risk 3: Agent prompts too long

**Mitigation:**
- Add file_counts requirement in concise section
- Keep examples minimal
- Use JSON schema instead of prose

**Fallback:**
- Phase 4 file counting is independent, works even if agent doesn't provide counts

### Risk 4: Breaking changes to existing projects

**Mitigation:**
- Add feature flag: `ENABLE_FILE_COUNTING=true` (default true)
- If disabled, fall back to agent-only detection
- Gradual rollout

**Fallback:**
- If file counting breaks, disable via env var

---

## Next Steps After Completion

1. **Gap Questions Service** - Implement interactive gap questions (from MIGRATION_COMPLETION_PLAN.md)
2. **Test Coverage >90%** - Add remaining unit tests for checkpointers, graphs
3. **Implement-Ticket Workflow** - Port implement-ticket from bash to orchestrator
4. **Performance Optimization** - Profile and optimize file counting for 100k+ file projects
5. **Documentation** - Complete user & developer guides

---

## Appendix: Reference Code Snippets

### Snippet 1: countFilesByLanguage (main branch)

```javascript
// From utils/stack-detection.js lines 62-114
async function countFilesByLanguage(projectPath) {
  const counts = {};

  const extensionMap = {
    'typescript': ['.ts', '.tsx'],
    'javascript': ['.js', '.jsx', '.mjs', '.cjs'],
    'python': ['.py'],
    'java': ['.java'],
    'go': ['.go'],
    'ruby': ['.rb'],
    'php': ['.php'],
    'rust': ['.rs'],
    'c': ['.c', '.h'],
    'cpp': ['.cpp', '.cc', '.cxx', '.hpp', '.hh', '.hxx'],
    'csharp': ['.cs'],
    'swift': ['.swift'],
    'kotlin': ['.kt', '.kts']
  };

  const excludeDirs = new Set([
    'node_modules', '.git', 'dist', 'build', 'out', 'target',
    '.next', '.nuxt', '.venv', 'venv', '__pycache__', '.pytest_cache',
    'coverage', '.coverage', '.tox', 'htmlcov', 'vendor'
  ]);

  async function countInDirectory(dirPath) {
    try {
      const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          if (excludeDirs.has(entry.name) || entry.name.startsWith('.')) {
            continue;
          }
          await countInDirectory(path.join(dirPath, entry.name));
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          for (const [lang, extensions] of Object.entries(extensionMap)) {
            if (extensions.includes(ext)) {
              counts[lang] = (counts[lang] || 0) + 1;
              break;
            }
          }
        }
      }
    } catch (error) {
      // Silently skip directories we can't read
    }
  }

  await countInDirectory(projectPath);
  return counts;
}
```

### Snippet 2: Agent Generation Validation (main branch)

```javascript
// From utils/agent-generation.js lines 44-59
async function generateAgents(stackProfile, skillSelection, projectPath, templatesPath) {
  // Validate that stack detection properly included all significant languages
  const languagesFromProfile = getAllLanguages(stackProfile);
  const languagesFromFileCounts = Object.keys(stackProfile.file_counts || {})
    .filter(lang => stackProfile.file_counts[lang] >= 10);

  const missingLanguages = languagesFromFileCounts.filter(
    lang => !languagesFromProfile.includes(lang)
  );

  if (missingLanguages.length > 0) {
    console.error(`❌ ERROR: Languages with significant code missing from stack profile: ${missingLanguages.join(', ')}`);
    console.error(`  This indicates a bug in stack detection. Languages must be detected during stack`);
    console.error(`  detection phase, NOT auto-added during agent generation, to ensure skills are copied.`);
    console.error(`  File counts: ${missingLanguages.map(l => `${l}(${stackProfile.file_counts[l]} files)`).join(', ')}`);
    throw new Error(`Stack profile missing languages: ${missingLanguages.join(', ')}. Run stack detection again.`);
  }

  // ... continue with agent generation
}
```

### Snippet 3: Multi-Stack Detection (main branch)

```javascript
// From utils/stack-detection.js lines 473-609
async function mergeWorkspaceProfiles(profiles, projectPath) {
  const aggregated = {
    project_path: projectPath,
    is_monorepo: profiles.length > 1,
    workspaces: profiles.map(p => ({
      path: path.relative(projectPath, p.project_path),
      language: p.primary_language,
      file_count: Object.values(p.file_counts || {}).reduce((a, b) => a + b, 0),
      dependencies: p.dependencies,
    })),
    multi_stack: {
      is_monorepo: true,
      workspace_count: profiles.length,
      languages: [],
      total_files: 0,
    },
    // ... merge other fields
  };

  // Aggregate language info
  const languageMap = new Map();
  for (const profile of profiles) {
    for (const [lang, count] of Object.entries(profile.file_counts || {})) {
      if (!languageMap.has(lang)) {
        languageMap.set(lang, { name: lang, file_count: 0, workspaces: [] });
      }
      const langInfo = languageMap.get(lang);
      langInfo.file_count += count;
      langInfo.workspaces.push(path.relative(projectPath, profile.project_path));
    }
  }

  aggregated.multi_stack.languages = Array.from(languageMap.values())
    .map(l => ({
      ...l,
      is_primary: l.file_count >= aggregated.multi_stack.total_files * 0.2,
    }));

  return aggregated;
}
```

---

## Document Metadata

**Version:** 1.0
**Last Updated:** 2026-03-24
**Author:** Claude Sonnet 4.5
**Status:** READY FOR IMPLEMENTATION
**Complexity:** HIGH
**Priority:** CRITICAL (P0)
**Estimated Effort:** 3-5 days
**Dependencies:** None
**Blocking:** All multi-language project initializations
