# Implementation Checklist - Orchestrator Fix

**Goal**: Add missing file counting and workspace detection features to TypeScript orchestrator while preserving ALL existing improvements (retry, validation, logging, LangGraph, hooks, etc.)

**Approach**: ADDITIVE - Add ~320 lines of new code, preserve ~3,000 lines of improvements

**Estimated Total Time**: 3-5 days

---

## Pre-Implementation Verification

- [ ] **V1**: Confirm current branch is `development`
  ```bash
  git branch --show-current
  ```
  Expected: `development`

- [ ] **V2**: Verify orchestrator tests pass baseline
  ```bash
  cd orchestration && npm test
  ```
  Expected: All tests pass, coverage ~82%

- [ ] **V3**: Create feature branch
  ```bash
  git checkout -b fix/add-file-counting-workspace-detection
  ```

---

## Phase 1: Core Utilities (Days 1-2)

### Step 1.1: Create File Counter Utility
**File**: `/orchestration/src/utils/file-counter.ts`
**Time**: 2-3 hours
**Status**: [ ]

**Action**: Create new file with the following structure:

```typescript
import { readdir, stat } from "fs/promises";
import { join, extname } from "path";
import { logger } from "./logger.js";

export interface FileCount {
  language: string;
  extensions: string[];
  count: number;
  directories: string[];
}

export interface FileCountResult {
  total_files: number;
  by_language: FileCount[];
  scanned_directories: number;
  errors: string[];
}

const LANGUAGE_EXTENSIONS: Record<string, string[]> = {
  typescript: [".ts", ".tsx"],
  javascript: [".js", ".jsx", ".mjs", ".cjs"],
  python: [".py", ".pyw", ".pyx"],
  java: [".java"],
  go: [".go"],
  rust: [".rs"],
  ruby: [".rb"],
  php: [".php"],
  csharp: [".cs"],
  cpp: [".cpp", ".cc", ".cxx", ".hpp", ".h"],
  c: [".c", ".h"],
  swift: [".swift"],
  kotlin: [".kt", ".kts"],
  scala: [".scala"],
};

const IGNORE_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "__pycache__",
  ".venv", "venv", "vendor", "target", ".next", ".nuxt",
]);

export async function countFilesByLanguage(
  projectPath: string,
  maxDepth: number = 10
): Promise<FileCountResult> {
  // Implementation from ORCHESTRATOR_FIX_PLAN.md
  // See plan document for full code
}

async function scanDirectory(
  dirPath: string,
  currentDepth: number,
  maxDepth: number,
  stats: Map<string, Set<string>>
): Promise<void> {
  // Implementation from ORCHESTRATOR_FIX_PLAN.md
}
```

**Verification**:
```bash
# File should exist and compile without errors
ls -la orchestration/src/utils/file-counter.ts
cd orchestration && npm run build
```

**Expected Outcome**: File compiles successfully, no TypeScript errors

---

### Step 1.2: Create Workspace Detector Utility
**File**: `/orchestration/src/utils/workspace-detector.ts`
**Time**: 3-4 hours
**Status**: [ ]

**Action**: Create new file with workspace detection logic:

```typescript
import { readdir, stat, readFile } from "fs/promises";
import { join, basename } from "path";
import { logger } from "./logger.js";

export interface Workspace {
  path: string;
  manifest_file: string;
  language: string;
  type: string;
  name?: string;
}

export interface WorkspaceDetectionResult {
  workspaces: Workspace[];
  is_monorepo: boolean;
  total_workspaces: number;
  errors: string[];
}

const MANIFEST_FILES: Record<string, { language: string; type: string }> = {
  "package.json": { language: "javascript", type: "npm" },
  "requirements.txt": { language: "python", type: "pip" },
  "Pipfile": { language: "python", type: "pipenv" },
  "pyproject.toml": { language: "python", type: "poetry" },
  "go.mod": { language: "go", type: "gomod" },
  "Cargo.toml": { language: "rust", type: "cargo" },
  "pom.xml": { language: "java", type: "maven" },
  "build.gradle": { language: "java", type: "gradle" },
  "Gemfile": { language: "ruby", type: "bundler" },
  "composer.json": { language: "php", type: "composer" },
};

export async function detectWorkspaces(
  projectPath: string,
  maxDepth: number = 5
): Promise<WorkspaceDetectionResult> {
  // Implementation from ORCHESTRATOR_FIX_PLAN.md
}

async function findManifestFiles(
  dirPath: string,
  currentDepth: number,
  maxDepth: number,
  found: Workspace[]
): Promise<void> {
  // Implementation from ORCHESTRATOR_FIX_PLAN.md
}
```

**Verification**:
```bash
ls -la orchestration/src/utils/workspace-detector.ts
cd orchestration && npm run build
```

**Expected Outcome**: File compiles successfully, exports work correctly

---

### Step 1.3: Add Unit Tests for File Counter
**File**: `/orchestration/test/unit/utils/file-counter.test.ts`
**Time**: 2 hours
**Status**: [ ]

**Action**: Create comprehensive test suite:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { countFilesByLanguage } from "../../../src/utils/file-counter.js";

describe("file-counter", () => {
  const testDir = join(__dirname, "fixtures", "file-counter-test");

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("should count TypeScript files correctly", async () => {
    // Create test files
    await writeFile(join(testDir, "test1.ts"), "// test");
    await writeFile(join(testDir, "test2.tsx"), "// test");

    const result = await countFilesByLanguage(testDir);

    expect(result.total_files).toBe(2);
    const tsCount = result.by_language.find(l => l.language === "typescript");
    expect(tsCount?.count).toBe(2);
  });

  it("should count Python files correctly", async () => {
    await writeFile(join(testDir, "test.py"), "# test");

    const result = await countFilesByLanguage(testDir);

    const pyCount = result.by_language.find(l => l.language === "python");
    expect(pyCount?.count).toBe(1);
  });

  it("should ignore node_modules and .git directories", async () => {
    const nodeModules = join(testDir, "node_modules");
    await mkdir(nodeModules, { recursive: true });
    await writeFile(join(nodeModules, "test.js"), "// should ignore");

    const result = await countFilesByLanguage(testDir);

    expect(result.total_files).toBe(0);
  });

  it("should handle multiple languages in monorepo", async () => {
    await writeFile(join(testDir, "test.ts"), "// ts");
    await writeFile(join(testDir, "test.py"), "# py");
    await writeFile(join(testDir, "test.go"), "// go");

    const result = await countFilesByLanguage(testDir);

    expect(result.total_files).toBe(3);
    expect(result.by_language).toHaveLength(3);
  });

  it("should respect maxDepth parameter", async () => {
    const deep = join(testDir, "a", "b", "c", "d", "e");
    await mkdir(deep, { recursive: true });
    await writeFile(join(deep, "test.ts"), "// deep");

    const result = await countFilesByLanguage(testDir, 3);

    expect(result.total_files).toBe(0); // Too deep
  });
});
```

**Verification**:
```bash
cd orchestration && npm test -- file-counter.test.ts
```

**Expected Outcome**: All tests pass, coverage >90%

---

### Step 1.4: Add Unit Tests for Workspace Detector
**File**: `/orchestration/test/unit/utils/workspace-detector.test.ts`
**Time**: 2 hours
**Status**: [ ]

**Action**: Create test suite for workspace detection:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, rm } from "fs/promises";
import { join } from "path";
import { detectWorkspaces } from "../../../src/utils/workspace-detector.js";

describe("workspace-detector", () => {
  const testDir = join(__dirname, "fixtures", "workspace-test");

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("should detect single package.json workspace", async () => {
    await writeFile(join(testDir, "package.json"), JSON.stringify({ name: "test" }));

    const result = await detectWorkspaces(testDir);

    expect(result.workspaces).toHaveLength(1);
    expect(result.workspaces[0].manifest_file).toBe("package.json");
    expect(result.workspaces[0].language).toBe("javascript");
    expect(result.is_monorepo).toBe(false);
  });

  it("should detect monorepo with multiple workspaces", async () => {
    // Root package.json
    await writeFile(join(testDir, "package.json"), JSON.stringify({ name: "root" }));

    // Backend Python workspace
    const backend = join(testDir, "backend");
    await mkdir(backend, { recursive: true });
    await writeFile(join(backend, "requirements.txt"), "flask==2.0.0");

    // Frontend TypeScript workspace
    const frontend = join(testDir, "frontend");
    await mkdir(frontend, { recursive: true });
    await writeFile(join(frontend, "package.json"), JSON.stringify({ name: "frontend" }));

    const result = await detectWorkspaces(testDir);

    expect(result.workspaces).toHaveLength(3);
    expect(result.is_monorepo).toBe(true);
    expect(result.total_workspaces).toBe(3);
  });

  it("should detect Python workspace with pyproject.toml", async () => {
    await writeFile(join(testDir, "pyproject.toml"), "[tool.poetry]\nname = 'test'");

    const result = await detectWorkspaces(testDir);

    expect(result.workspaces[0].manifest_file).toBe("pyproject.toml");
    expect(result.workspaces[0].type).toBe("poetry");
  });

  it("should ignore node_modules directories", async () => {
    const nodeModules = join(testDir, "node_modules", "some-package");
    await mkdir(nodeModules, { recursive: true });
    await writeFile(join(nodeModules, "package.json"), "{}");

    const result = await detectWorkspaces(testDir);

    expect(result.workspaces).toHaveLength(0);
  });

  it("should respect maxDepth", async () => {
    const deep = join(testDir, "a", "b", "c", "d", "e");
    await mkdir(deep, { recursive: true });
    await writeFile(join(deep, "package.json"), "{}");

    const result = await detectWorkspaces(testDir, 3);

    expect(result.workspaces).toHaveLength(0);
  });
});
```

**Verification**:
```bash
cd orchestration && npm test -- workspace-detector.test.ts
```

**Expected Outcome**: All tests pass, coverage >90%

---

### Step 1.5: Verify All Tests Pass
**Time**: 30 minutes
**Status**: [ ]

**Action**: Run full test suite and verify coverage

**Verification**:
```bash
cd orchestration && npm test
npm run test:coverage
```

**Expected Outcome**:
- All existing tests still pass (preserve improvements!)
- New tests pass
- Overall coverage remains >80% (ideally >85%)

**Checkpoint**: Commit utilities and tests
```bash
git add orchestration/src/utils/file-counter.ts
git add orchestration/src/utils/workspace-detector.ts
git add orchestration/test/unit/utils/file-counter.test.ts
git add orchestration/test/unit/utils/workspace-detector.test.ts
git commit -m "feat: add file counting and workspace detection utilities

- Add file-counter.ts with language-based file counting
- Add workspace-detector.ts for monorepo workspace discovery
- Add comprehensive unit tests with >90% coverage
- Support 15+ languages (TypeScript, Python, Java, Go, etc.)
- Ignore common build/dependency directories"
```

---

## Phase 2: Phase 4 Integration (Day 2-3)

### Step 2.1: Import New Utilities in context-generation.node.ts
**File**: `/orchestration/src/nodes/initialize-project/phase4/context-generation.node.ts`
**Time**: 15 minutes
**Status**: [ ]

**Action**: Add imports at top of file (after existing imports):

```typescript
// ADD THESE IMPORTS
import { countFilesByLanguage } from "../../../utils/file-counter.js";
import { detectWorkspaces } from "../../../utils/workspace-detector.js";
import type { FileCountResult, WorkspaceDetectionResult } from "../../../utils/workspace-detector.js";
```

**Location**: After line ~15 (after existing imports)

**Verification**:
```bash
cd orchestration && npm run build
```

**Expected Outcome**: No TypeScript errors, imports resolve correctly

---

### Step 2.2: Add File Counting Call
**File**: `/orchestration/src/nodes/initialize-project/phase4/context-generation.node.ts`
**Time**: 1 hour
**Status**: [ ]

**Action**: Add file counting logic AFTER existing language extraction (around line 150)

**Current Code** (lines ~145-155):
```typescript
const languagesFromPhase1 = Array.isArray(structureFindings?.languages)
  ? structureFindings.languages.map((l: string) => l.toLowerCase())
  : [];

const stackProfile: StackProfile = {
  languages: languagesFromPhase1,
  file_counts: undefined,
};
```

**Replace With**:
```typescript
const languagesFromPhase1 = Array.isArray(structureFindings?.languages)
  ? structureFindings.languages.map((l: string) => l.toLowerCase())
  : [];

// STEP 1: Count files by language (independent validation)
logger.info("Counting files by language for validation...");
let fileCountResult: FileCountResult | undefined;
try {
  fileCountResult = await countFilesByLanguage(projectPath, 10);
  logger.success(`Found ${fileCountResult.total_files} files across ${fileCountResult.by_language.length} languages`);

  // Log breakdown
  for (const langCount of fileCountResult.by_language) {
    logger.info(`  ${langCount.language}: ${langCount.count} files`);
  }
} catch (error) {
  logger.warn(`File counting failed: ${error instanceof Error ? error.message : String(error)}`);
  logger.warn("Continuing with agent-detected languages only");
}

// STEP 2: Cross-validate agent findings with file counts
const detectedLanguages = new Set(languagesFromPhase1);

if (fileCountResult) {
  for (const langCount of fileCountResult.by_language) {
    const lang = langCount.language.toLowerCase();

    // If file counter found significant files but agent missed it
    if (langCount.count >= 5 && !detectedLanguages.has(lang)) {
      logger.warn(`Agent missed ${lang} (${langCount.count} files) - adding to stack profile`);
      detectedLanguages.add(lang);
    }
  }
}

const finalLanguages = Array.from(detectedLanguages);

const stackProfile: StackProfile = {
  languages: finalLanguages,
  file_counts: fileCountResult ? {
    total: fileCountResult.total_files,
    by_language: fileCountResult.by_language.map(lc => ({
      language: lc.language,
      count: lc.count,
    })),
  } : undefined,
};
```

**Verification**:
```bash
cd orchestration && npm run build
npm test -- context-generation.test.ts
```

**Expected Outcome**:
- Build succeeds
- Tests pass
- stackProfile now includes file_counts

---

### Step 2.3: Add Workspace Detection Call
**File**: `/orchestration/src/nodes/initialize-project/phase4/context-generation.node.ts`
**Time**: 1 hour
**Status**: [ ]

**Action**: Add workspace detection AFTER file counting (insert after previous step)

```typescript
// STEP 3: Detect workspaces for monorepo projects
logger.info("Detecting workspaces...");
let workspaceResult: WorkspaceDetectionResult | undefined;
try {
  workspaceResult = await detectWorkspaces(projectPath, 5);

  if (workspaceResult.is_monorepo) {
    logger.success(`Monorepo detected with ${workspaceResult.total_workspaces} workspaces`);
    for (const ws of workspaceResult.workspaces) {
      logger.info(`  ${ws.path} (${ws.language} - ${ws.type})`);
    }
  } else {
    logger.info("Single-repo project (no additional workspaces)");
  }
} catch (error) {
  logger.warn(`Workspace detection failed: ${error instanceof Error ? error.message : String(error)}`);
}

// STEP 4: Update stack profile with workspace info
if (workspaceResult && workspaceResult.is_monorepo) {
  // Extract unique languages from workspaces
  const workspaceLanguages = new Set(
    workspaceResult.workspaces.map(ws => ws.language.toLowerCase())
  );

  // Merge with detected languages
  for (const lang of workspaceLanguages) {
    if (!detectedLanguages.has(lang)) {
      logger.info(`Added ${lang} from workspace detection`);
      detectedLanguages.add(lang);
    }
  }

  // Update final languages
  stackProfile.languages = Array.from(detectedLanguages);

  // Add workspace info to stack profile
  stackProfile.multi_stack = {
    is_monorepo: true,
    workspaces: workspaceResult.workspaces.map(ws => ({
      path: ws.path,
      language: ws.language,
      manifest: ws.manifest_file,
    })),
  };
} else {
  stackProfile.multi_stack = null;
}
```

**Verification**:
```bash
cd orchestration && npm run build
npm test -- context-generation.test.ts
```

**Expected Outcome**: stackProfile includes multi_stack info for monorepos

---

### Step 2.4: Add Validation Logic
**File**: `/orchestration/src/nodes/initialize-project/phase4/context-generation.node.ts`
**Time**: 30 minutes
**Status**: [ ]

**Action**: Add validation AFTER workspace detection to ensure completeness

```typescript
// STEP 5: Validate stack profile completeness
logger.info("Validating stack profile completeness...");

// Check 1: If file counts show significant files for a language, it must be in languages array
if (fileCountResult) {
  for (const langCount of fileCountResult.by_language) {
    if (langCount.count >= 10) {
      const lang = langCount.language.toLowerCase();
      if (!stackProfile.languages.includes(lang)) {
        logger.error(`Validation failed: ${langCount.count} ${lang} files found but language not in profile`);
        throw new Error(
          `Stack profile missing ${lang} despite ${langCount.count} files detected. ` +
          `This will cause incorrect agent generation.`
        );
      }
    }
  }
}

// Check 2: Warn if no files found for a detected language
for (const lang of stackProfile.languages) {
  const fileCount = fileCountResult?.by_language.find(
    lc => lc.language.toLowerCase() === lang.toLowerCase()
  );

  if (!fileCount || fileCount.count === 0) {
    logger.warn(`Language ${lang} in profile but no files found - may be configuration-only`);
  }
}

logger.success("Stack profile validation passed");
logger.info(`Final languages: ${stackProfile.languages.join(", ")}`);
```

**Verification**:
```bash
cd orchestration && npm run build
```

**Expected Outcome**: Validation throws error if languages are missing

---

### Step 2.5: Update StackProfile Type Definition
**File**: `/orchestration/src/state/initialize-project.state.ts`
**Time**: 30 minutes
**Status**: [ ]

**Action**: Add file_counts and multi_stack to StackProfile type

**Current Type** (around line 50):
```typescript
export interface StackProfile {
  languages: string[];
  file_counts?: {
    total: number;
    by_language: Array<{ language: string; count: number }>;
  };
}
```

**Update To**:
```typescript
export interface StackProfile {
  languages: string[];
  file_counts?: {
    total: number;
    by_language: Array<{ language: string; count: number }>;
  };
  multi_stack?: {
    is_monorepo: boolean;
    workspaces: Array<{
      path: string;
      language: string;
      manifest: string;
    }>;
  } | null;
}
```

**Verification**:
```bash
cd orchestration && npm run build
```

**Expected Outcome**: Type checks pass, no TypeScript errors

---

### Step 2.6: Test Phase 4 Integration
**Time**: 1 hour
**Status**: [ ]

**Action**: Test with real monorepo project

**Test Command**:
```bash
# Use the Portal project that was failing before
cd /path/to/portal-project
bash /path/to/framework/scripts/initialize-project.sh
```

**Expected Outcomes**:
1. File counting shows Python files (should see 1,704 .py files)
2. Workspace detection identifies backend/ and frontend/ workspaces
3. Final stackProfile includes both TypeScript and Python
4. No validation errors thrown
5. Correct agents generated for both languages

**Verification Checkpoints During Execution**:
- [ ] See "Counting files by language..." log message
- [ ] See file counts for Python AND TypeScript
- [ ] See "Detecting workspaces..." log message
- [ ] See monorepo detection with 2+ workspaces
- [ ] See "Validation passed" message
- [ ] Phase 5 generates both Python and TypeScript agents

**If Issues**:
- Check logs in `.claude-temp/phase4/`
- Verify file-counter found .py files
- Verify workspace-detector found requirements.txt

**Checkpoint**: Commit Phase 4 integration
```bash
git add orchestration/src/nodes/initialize-project/phase4/context-generation.node.ts
git add orchestration/src/state/initialize-project.state.ts
git commit -m "feat: integrate file counting and workspace detection into Phase 4

- Add file counting with cross-validation against agent findings
- Add workspace detection for monorepo support
- Add validation to ensure stack profile completeness
- Update StackProfile type with file_counts and multi_stack
- Preserve all existing improvements (retry, logging, etc.)"
```

---

## Phase 3: Phase 5 Validation (Day 3)

### Step 3.1: Add Pre-Resource Validation
**File**: `/orchestration/src/nodes/initialize-project/phase5/resources.node.ts`
**Time**: 1 hour
**Status**: [ ]

**Action**: Add validation BEFORE copying skills/agents

**Location**: Around line 30, BEFORE `await copySkills(...)`

**Add This Code**:
```typescript
// VALIDATION: Ensure stack profile is complete before generating resources
logger.info("Validating stack profile before resource generation...");

const stackProfile = state.stackProfile;
if (!stackProfile || !stackProfile.languages || stackProfile.languages.length === 0) {
  throw new Error(
    "Stack profile is empty or invalid. Cannot generate agents/skills without knowing project languages."
  );
}

// If we have file counts, verify they match languages
if (stackProfile.file_counts) {
  const languagesWithFiles = stackProfile.file_counts.by_language
    .filter(lc => lc.count >= 5)
    .map(lc => lc.language.toLowerCase());

  const profileLanguages = new Set(stackProfile.languages.map(l => l.toLowerCase()));

  for (const lang of languagesWithFiles) {
    if (!profileLanguages.has(lang)) {
      logger.error(`Language ${lang} has ${stackProfile.file_counts.by_language.find(lc => lc.language === lang)?.count} files but is not in stack profile`);
      throw new Error(
        `Stack profile validation failed: ${lang} detected but not included. ` +
        `This indicates a Phase 4 bug. Check file counting and language detection.`
      );
    }
  }
}

logger.success(`Stack profile validated: ${stackProfile.languages.join(", ")}`);
if (stackProfile.multi_stack?.is_monorepo) {
  logger.info(`Monorepo with ${stackProfile.multi_stack.workspaces.length} workspaces`);
}
```

**Verification**:
```bash
cd orchestration && npm run build
npm test -- resources.test.ts
```

**Expected Outcome**: Validation blocks resource generation if stack profile is incomplete

---

### Step 3.2: Test Full Pipeline
**Time**: 2 hours
**Status**: [ ]

**Action**: Run full initialization on multiple test projects

**Test Case 1: Monorepo (TypeScript + Python)**
```bash
# Portal project or similar
cd /path/to/monorepo-project
bash /path/to/framework/scripts/initialize-project.sh
```

**Expected**:
- [ ] Phase 1: Agents complete successfully
- [ ] Phase 2: Consolidation completes
- [ ] Phase 3: Opus synthesis completes
- [ ] Phase 4: File counting finds both languages
- [ ] Phase 4: Workspace detection finds multiple workspaces
- [ ] Phase 4: Validation passes
- [ ] Phase 5: Validation passes
- [ ] Phase 5: Skills copied for both TypeScript AND Python
- [ ] Phase 5: Agents generated for both languages
- [ ] Phase 6: Final validation passes
- [ ] CLAUDE.md created
- [ ] project-context skill created with complete info

**Test Case 2: Single-Stack TypeScript**
```bash
# Simple TypeScript project
cd /path/to/typescript-project
bash /path/to/framework/scripts/initialize-project.sh
```

**Expected**:
- [ ] Detects TypeScript only
- [ ] No monorepo flag set
- [ ] Correct TypeScript skills copied
- [ ] No Python agents/skills generated

**Test Case 3: Single-Stack Python**
```bash
# Simple Python project
cd /path/to/python-project
bash /path/to/framework/scripts/initialize-project.sh
```

**Expected**:
- [ ] Detects Python only
- [ ] Finds requirements.txt or pyproject.toml
- [ ] Correct Python skills copied
- [ ] No TypeScript agents/skills generated

---

## Phase 4: Gap Questions Migration (Day 4)

### Step 4.1: Create Gap Questions Service
**File**: `/orchestration/src/services/gap-questions.service.ts`
**Time**: 3 hours
**Status**: [ ]

**Action**: Migrate gap questions from bash to TypeScript

**Reference**: See `MIGRATION_COMPLETION_PLAN.md` lines 150-350 for full implementation

**Key Structure**:
```typescript
import Anthropic from "@anthropic-ai/sdk";
import { logger } from "../utils/logger.js";

export interface GapQuestion {
  id: string;
  question: string;
  context: string;
  suggestions: string[];
}

export interface GapQuestionsResult {
  questions: GapQuestion[];
  user_responses: Record<string, string>;
  skipped: boolean;
}

export async function askGapQuestions(
  gaps: string[],
  projectPath: string,
  frameworkPath: string,
  skipQuestions: boolean = false
): Promise<GapQuestionsResult> {
  // Implementation
}
```

**Verification**:
```bash
cd orchestration && npm run build
```

---

### Step 4.2: Update Phase 2 Consolidation
**File**: `/orchestration/src/nodes/initialize-project/phase2/consolidation.node.ts`
**Time**: 1 hour
**Status**: [ ]

**Action**: Replace bash script call with TypeScript service

**Current Code** (lines 530-540):
```typescript
const askScript = join(
  frameworkPath,
  "skills/010-foundation/initialize-project/scripts/helpers/ask-gap-questions.js",
);
// ... bash execution
```

**Replace With**:
```typescript
import { askGapQuestions } from "../../../services/gap-questions.service.js";

// ... later in function:

const gapResult = await askGapQuestions(
  gaps,
  projectPath,
  frameworkPath,
  process.env.SKIP_GAP_QUESTIONS === "true"
);

if (!gapResult.skipped && Object.keys(gapResult.user_responses).length > 0) {
  logger.info("User provided gap responses, incorporating into context...");
  // Add to consolidated findings
}
```

**Verification**:
```bash
cd orchestration && npm run build
npm test -- consolidation.test.ts
```

---

### Step 4.3: Test Gap Questions Flow
**Time**: 1 hour
**Status**: [ ]

**Action**: Test interactive gap questions

**Test**:
```bash
# Without skipping (interactive)
cd /path/to/project
bash /path/to/framework/scripts/initialize-project.sh

# With skipping (automated)
bash /path/to/framework/scripts/initialize-project.sh --skip-gap-questions
```

**Expected**:
- [ ] If gaps detected and NOT skipped: User sees questions
- [ ] User can provide answers
- [ ] Answers incorporated into consolidated findings
- [ ] If `--skip-gap-questions`: No prompts, auto-continues

---

## Phase 5: Documentation & Testing (Day 5)

### Step 5.1: Update Type Definitions
**Time**: 30 minutes
**Status**: [ ]

**Action**: Ensure all new types are exported

**Files to Check**:
- [ ] `/orchestration/src/utils/file-counter.ts` exports `FileCount`, `FileCountResult`
- [ ] `/orchestration/src/utils/workspace-detector.ts` exports `Workspace`, `WorkspaceDetectionResult`
- [ ] `/orchestration/src/state/initialize-project.state.ts` has updated `StackProfile`

**Verification**:
```bash
cd orchestration && npm run build
# No TypeScript errors about missing types
```

---

### Step 5.2: Run Full Test Suite
**Time**: 1 hour
**Status**: [ ]

**Action**: Verify ALL tests pass

```bash
cd orchestration
npm test
npm run test:coverage
```

**Expected**:
- [ ] All existing tests pass (NO REGRESSIONS)
- [ ] New tests pass
- [ ] Coverage >80% (ideally >85%)
- [ ] No TypeScript errors
- [ ] No ESLint errors

---

### Step 5.3: Integration Testing on Real Projects
**Time**: 2 hours
**Status**: [ ]

**Test Projects**:

1. **Portal (Monorepo with TypeScript + Python)**
   - [ ] Run initialization
   - [ ] Verify both languages detected
   - [ ] Verify 1,704 .py files found
   - [ ] Verify workspace detection works
   - [ ] Verify correct agents generated
   - [ ] Verify CLAUDE.md accurate

2. **Pure TypeScript Project**
   - [ ] Run initialization
   - [ ] Verify only TypeScript detected
   - [ ] Verify correct skills copied
   - [ ] No Python artifacts

3. **Pure Python Project**
   - [ ] Run initialization
   - [ ] Verify only Python detected
   - [ ] Verify requirements.txt found
   - [ ] Correct Python skills

4. **Java Project (if available)**
   - [ ] Verify Java detection
   - [ ] Verify pom.xml or build.gradle found

---

### Step 5.4: Update Documentation
**Time**: 1 hour
**Status**: [ ]

**Files to Update**:

**1. README.md** - Add note about file counting feature
```markdown
## Features
- Multi-language monorepo support with automatic workspace detection
- File counting and validation (supports 15+ languages)
- ...
```

**2. docs/INITIALIZE_PROJECT.md** - Document new features
```markdown
### File Counting
The orchestrator automatically counts files by language to validate agent detection...

### Workspace Detection
For monorepo projects, workspaces are automatically discovered...
```

**3. CHANGELOG.md** - Add entry
```markdown
## [Unreleased]
### Added
- File counting utility for language validation
- Workspace detection for monorepo support
- Stack profile validation before resource generation
- Gap questions migrated to TypeScript service
```

---

### Step 5.5: Performance Testing
**Time**: 1 hour
**Status**: [ ]

**Action**: Verify file counting doesn't slow down initialization

**Test**:
```bash
# Time the full initialization
time bash scripts/initialize-project.sh /path/to/large-project
```

**Expected**:
- File counting should add <10 seconds for projects with <10k files
- For very large projects (>50k files), should still complete in <30 seconds
- Overall initialization should still be <30 minutes for most projects

**If Slow**: Consider adding file counting cache or limiting depth

---

## Phase 6: Cleanup & Deployment (Day 5)

### Step 6.1: Remove Dead Code
**Time**: 30 minutes
**Status**: [ ]

**Action**: Remove any old bash scripts that are no longer needed

**Check**:
- [ ] Can we remove `ask-gap-questions.js`? (YES - now in TypeScript)
- [ ] Any other unused helper scripts in `skills/010-foundation/initialize-project/scripts/helpers/`?

**Verification**:
```bash
# Search for references to removed files
cd /path/to/framework
rg "ask-gap-questions.js"
# Should find ZERO references (we replaced them all)
```

---

### Step 6.2: Linting & Formatting
**Time**: 15 minutes
**Status**: [ ]

**Action**: Ensure code follows project standards

```bash
cd orchestration
npm run lint
npm run format
```

**Fix any issues found**

---

### Step 6.3: Final Commit
**Time**: 15 minutes
**Status**: [ ]

**Action**: Create final commit with all changes

```bash
git add -A
git status
# Review changes carefully

git commit -m "feat: complete TypeScript migration with file counting and workspace detection

BREAKING: Removes bash/JS dependencies from orchestrator

Added:
- File counting utility (15+ languages)
- Workspace detection for monorepo support
- Stack profile validation before resource generation
- Gap questions service in TypeScript
- Comprehensive unit tests (>90% coverage)

Improved:
- Cross-validation between agent detection and file counts
- Monorepo handling with multi-stack support
- Error messages when languages are missed
- Type safety with Zod validation throughout

Preserved:
- Enhanced retry mechanism with progressive feedback
- Structured validation system
- Professional logging with spinners
- Concurrent agent tracking
- Hybrid auth system
- LangGraph orchestration
- Hooks system
- 82%+ test coverage
- All existing improvements from development branch

Fixed:
- Portal project now detects 1,704 Python files correctly
- Monorepo workspace detection works for TypeScript + Python
- No more bash/JS script dependencies
- Stack profile validation prevents missing languages

Closes #<issue-number>"
```

---

### Step 6.4: Create Pull Request
**Time**: 30 minutes
**Status**: [ ]

**Action**: Open PR from feature branch to development

```bash
git push origin fix/add-file-counting-workspace-detection
gh pr create --title "Complete TypeScript migration with file counting and workspace detection" \
  --body "$(cat <<'EOF'
## Summary

Completes the TypeScript migration by:
1. Adding file counting utility to validate agent language detection
2. Adding workspace detection for monorepo support
3. Migrating gap questions from bash to TypeScript
4. Adding comprehensive validation before resource generation

## Changes

### Added
- `file-counter.ts` - Count files by language (15+ languages supported)
- `workspace-detector.ts` - Discover monorepo workspaces via manifest files
- `gap-questions.service.ts` - TypeScript gap questions (replaces bash)
- Comprehensive unit tests with >90% coverage
- Stack profile validation in Phase 4 and Phase 5

### Modified
- `context-generation.node.ts` - Integrate file counting and workspace detection
- `consolidation.node.ts` - Use TypeScript gap questions service
- `resources.node.ts` - Add validation before resource generation
- `initialize-project.state.ts` - Update StackProfile type

### Removed
- Bash/JS script dependencies from orchestrator
- `ask-gap-questions.js` (replaced with TypeScript service)

## Preserved Improvements
✅ Enhanced retry mechanism (294 lines)
✅ Structured validation (316 lines)
✅ Professional logging (403 lines)
✅ Concurrent tracking (193 lines)
✅ Hybrid auth system (655 lines)
✅ LangGraph orchestration
✅ Hooks system (446 lines)
✅ 82%+ test coverage
✅ All development branch improvements

## Testing

- [x] Unit tests pass (>90% coverage for new code)
- [x] Integration tests on monorepo (Portal: 1,704 .py files detected ✓)
- [x] Integration tests on single-stack TypeScript project
- [x] Integration tests on single-stack Python project
- [x] No regressions in existing tests
- [x] Performance acceptable (<10s overhead for file counting)

## Fixes

- ✅ Portal project detection (was missing 1,704 Python files)
- ✅ Monorepo workspace detection
- ✅ No more "ask-gap-questions.js not found" error
- ✅ Stack profile validation prevents incorrect agent generation

## Screenshots

[Add screenshots of successful Portal initialization showing both TypeScript and Python detected]

## Checklist

- [x] All tests pass
- [x] No TypeScript errors
- [x] Documentation updated
- [x] CHANGELOG.md updated
- [x] No bash/JS dependencies in orchestrator
- [x] Preserves all development branch improvements

EOF
)"
```

---

## Final Verification Checklist

### Code Quality
- [ ] All TypeScript compiles without errors
- [ ] All tests pass (npm test)
- [ ] Test coverage >80% overall, >90% for new code
- [ ] No ESLint errors
- [ ] Code formatted consistently

### Functionality
- [ ] File counting works for 15+ languages
- [ ] Workspace detection finds monorepo workspaces
- [ ] Stack profile validation prevents missing languages
- [ ] Gap questions work in TypeScript
- [ ] No bash/JS script dependencies remain

### Testing
- [ ] Monorepo projects fully detected (TypeScript + Python)
- [ ] Single-stack projects work correctly
- [ ] Gap questions interactive mode works
- [ ] Gap questions skip mode works
- [ ] Error handling graceful for edge cases

### Preservation
- [ ] Enhanced retry mechanism still works
- [ ] Structured validation still works
- [ ] Professional logging still works
- [ ] Concurrent agent tracking still works
- [ ] Hybrid auth system still works
- [ ] LangGraph orchestration still works
- [ ] Hooks system still works
- [ ] All existing tests still pass

### Documentation
- [ ] README.md updated
- [ ] INITIALIZE_PROJECT.md updated
- [ ] CHANGELOG.md updated
- [ ] Code comments added where needed
- [ ] Type definitions complete

### Performance
- [ ] File counting adds <10s overhead
- [ ] Total initialization <30 minutes for most projects
- [ ] No memory leaks
- [ ] Graceful handling of very large projects

---

## Rollback Plan

If issues are discovered after deployment:

1. **Revert PR**:
   ```bash
   git revert <commit-hash>
   git push
   ```

2. **Emergency Hotfix**:
   - Create hotfix branch from development
   - Apply minimal fix
   - Test thoroughly
   - Deploy hotfix

3. **Known Issues**:
   - If file counting is too slow: Add `--skip-file-counting` flag
   - If workspace detection fails: Fall back to agent detection only
   - If tests fail: Check Node version (requires 14+)

---

## Success Metrics

After deployment, verify:

- [ ] Portal project initialization succeeds (was failing before)
- [ ] Both TypeScript and Python detected in Portal
- [ ] 1,704 .py files counted and validated
- [ ] Workspace detection identifies backend/ and frontend/
- [ ] Correct agents generated (both languages)
- [ ] CLAUDE.md includes both TypeScript and Python
- [ ] project-context skill has complete information
- [ ] No "script not found" errors
- [ ] All development branch improvements preserved

---

## Timeline Summary

- **Day 1**: Phase 1 (Core Utilities) - 6-8 hours
- **Day 2**: Phase 1 completion + Phase 2 start - 6-8 hours
- **Day 3**: Phase 2 completion + Phase 3 - 6-8 hours
- **Day 4**: Phase 4 (Gap Questions) - 4-6 hours
- **Day 5**: Phase 5-6 (Testing & Deployment) - 6-8 hours

**Total Estimated Time**: 28-38 hours (3.5-5 days)

---

## Notes

- This is an ADDITIVE change - we're adding ~320 lines of new functionality
- We're preserving ~3,000 lines of improvements from development branch
- Focus on testing - this framework will be used in 1000+ projects
- If stuck, refer to `ORCHESTRATOR_FIX_PLAN.md` for detailed code examples
- If confused about what to preserve, check `ORCHESTRATOR_IMPROVEMENTS_ANALYSIS.md`

---

## Contact

If you encounter issues during implementation:
1. Check the detailed plans: `ORCHESTRATOR_FIX_PLAN.md`, `ORCHESTRATOR_IMPROVEMENTS_ANALYSIS.md`
2. Review commit history on `feat/refactor-implement-ticket` branch
3. Check test output for specific errors
4. Review logs in `.claude-temp/` directory
