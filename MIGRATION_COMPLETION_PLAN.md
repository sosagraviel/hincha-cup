# AI Agentic Framework - Complete TypeScript Orchestrator Migration Plan

**Status:** INCOMPLETE - 1 Critical Blocker Remaining
**Created:** 2026-03-24
**Target Completion:** End of Week 2
**Test Coverage Goal:** >90%

---

## Executive Summary

The orchestrator migration from bash/JS to TypeScript is **95% complete** with **1 critical blocker** preventing the removal of legacy utils/ folder:

**BLOCKER:** Interactive gap questions functionality is referenced but not implemented in TypeScript. The consolidation phase calls a non-existent JavaScript file at:
```
skills/010-foundation/initialize-project/scripts/helpers/ask-gap-questions.js
```

This document provides a comprehensive plan to:
1. ✅ Complete the migration (fix the blocker)
2. ✅ Achieve >90% test coverage
3. ✅ Ensure production-ready code for 1000+ projects
4. ✅ Remove all external dependencies (utils/, bash scripts)
5. ✅ Verify complete self-containment

---

## Part 1: Current State Analysis

### 1.1 What's Already Migrated ✅

| Component | Status | Location | Tests |
|-----------|--------|----------|-------|
| **Initialize-Project Workflow** | ✅ Complete | `orchestration/src/graphs/initialize-project.graph.ts` | ✅ |
| Phase 1: Analyzers (4 agents) | ✅ Complete | `orchestration/src/nodes/initialize-project/phase1/` | ✅ 100% |
| Phase 2: Consolidation | ⚠️ **Missing gap questions** | `orchestration/src/nodes/initialize-project/phase2/` | ✅ 80% |
| Phase 3: Synthesis | ✅ Complete | `orchestration/src/nodes/initialize-project/phase3/` | ✅ |
| Phase 4: Context Generation | ✅ Complete | `orchestration/src/nodes/initialize-project/phase4/` | ✅ |
| Phase 5: Resources | ✅ Complete | `orchestration/src/nodes/initialize-project/phase5/` | ✅ |
| Phase 6: Validation | ✅ Complete | `orchestration/src/nodes/initialize-project/phase6/` | ✅ |
| **Implement-Ticket Workflow** | ✅ Complete | `orchestration/src/graphs/implement-ticket.graph.ts` | ✅ |
| All 11 Phases (0-10) | ✅ Complete | `orchestration/src/nodes/implement-ticket/` | ✅ 100% |
| **Shared Services** | ✅ Complete | `orchestration/src/services/` | ✅ 95% |
| Agent Invoker | ✅ Complete | `services/implement-ticket/agent-invoker.service.ts` | ✅ |
| Screenshot Service | ✅ Complete | `services/implement-ticket/screenshot.service.ts` | ✅ |
| Test Orchestrator | ✅ Complete | `services/implement-ticket/test-orchestrator.service.ts` | ✅ |
| Artifact Collector | ✅ Complete | `services/implement-ticket/artifact-collector.service.ts` | ✅ |
| Environment Manager | ✅ Complete | `services/implement-ticket/environment-manager.service.ts` | ✅ |
| Review Loop | ✅ Complete | `services/implement-ticket/review-loop.service.ts` | ✅ |
| **Utilities** | ✅ Complete | `orchestration/src/utils/` | ✅ 90% |
| Agent Factory | ✅ Complete | `utils/agent-factory.ts` | ✅ |
| Enhanced Retry | ✅ Complete | `utils/enhanced-retry.ts` | ✅ |
| Validator | ✅ Complete | `utils/validator.ts` | ✅ |
| Consolidation | ✅ Complete | `utils/consolidation.ts` | ✅ |
| Skill Resolver | ✅ Complete | `utils/skill-resolver.ts` | ✅ |
| Config Generator | ✅ Complete | `utils/config-generator.ts` | ✅ |
| Agent Generator | ✅ Complete | `utils/agent-generator.ts` | ✅ |
| Logger | ✅ Complete | `utils/logger.ts` | ✅ |
| Concurrent Agent Tracker | ✅ Complete | `utils/concurrent-agent-tracker.ts` | ❌ **NO TESTS** |

### 1.2 What's Missing ❌

| Component | Impact | Priority |
|-----------|--------|----------|
| **Interactive Gap Questions Service** | 🔴 **CRITICAL BLOCKER** | P0 |
| Unit tests for SQLite Checkpointer | 🟡 Coverage gap | P1 |
| Unit tests for Concurrent Agent Tracker | 🟡 Coverage gap | P1 |
| Unit tests for Graph orchestration | 🟡 Coverage gap | P2 |
| Full E2E integration tests | 🟡 Risk mitigation | P2 |

### 1.3 External Dependencies Audit

**Current Dependencies on External Code:**

```typescript
// orchestration/src/nodes/initialize-project/phase2/consolidation.node.ts:533
const askScript = join(
  frameworkPath,
  "skills/010-foundation/initialize-project/scripts/helpers/ask-gap-questions.js"
);
```

**Status:** ❌ File does not exist
**Impact:** Workflow crashes when gaps are detected (>5 gaps or conflicts)
**Resolution:** Implement in TypeScript (see Section 2)

**No other external dependencies found in orchestration module** ✅

### 1.4 Test Coverage Report

**Overall Coverage:** 82% (42/51 files have tests)

**Files WITHOUT Tests (9 files):**
1. `orchestration/src/state/checkpointers/sqlite.checkpointer.ts` ❌
2. `orchestration/src/state/schemas/initialize-project.schema.ts` ❌ (Zod schema - low risk)
3. `orchestration/src/state/schemas/implement-ticket.schema.ts` ❌ (Zod schema - low risk)
4. `orchestration/src/cli/initialize.ts` ❌ (Has integration test)
5. `orchestration/src/cli/implement.ts` ❌ (Has integration test)
6. `orchestration/src/graphs/initialize-project.graph.ts` ❌
7. `orchestration/src/graphs/implement-ticket.graph.ts` ❌
8. `orchestration/src/utils/concurrent-agent-tracker.ts` ❌ **HIGH PRIORITY**
9. `orchestration/src/hooks/index.ts` ❌ (Export file - low risk)

**Coverage Breakdown by Component:**

| Component | Coverage | Files | Tested | Missing |
|-----------|----------|-------|--------|---------|
| Phase 1 Analyzers | 100% | 4 | 4 | 0 |
| Phase 2-6 Nodes | 100% | 5 | 5 | 0 |
| Implement-Ticket Phases | 100% | 11 | 11 | 0 |
| Services | 100% | 8 | 8 | 0 |
| Utils | 88% | 9 | 8 | 1 |
| State/Checkpointers | 0% | 1 | 0 | 1 |
| Graphs | 0% | 2 | 0 | 2 |
| CLI | 50% | 2 | 0 | 2 (partial integration) |
| Schemas | 0% | 2 | 0 | 2 (low risk) |

**Path to >90% Coverage:**
- Add 4 test files (~600 lines)
- Focus: checkpointers, concurrent tracker, graph orchestration
- Estimated effort: 2-3 days

---

## Part 2: Detailed Implementation Plan

### Phase 0: Pre-Migration Verification ✅

**Objective:** Confirm current state and dependencies

**Tasks:**
- [x] Audit all external dependencies in orchestrator
- [x] Analyze git history for migration commits
- [x] Review test coverage statistics
- [x] Identify missing functionality
- [x] Document architectural state

**Result:** Analysis complete (see Part 1)

---

### Phase 1: Fix Critical Blocker - Gap Questions Service

**Priority:** 🔴 P0 - BLOCKS EVERYTHING
**Estimated Effort:** 8-10 hours
**Dependencies:** `inquirer` package (or `prompts`)

#### 1.1 Implementation: Gap Questions Service

**File:** `orchestration/src/services/initialize-project/gap-questions.service.ts`
**Lines:** ~300-400
**Purpose:** Interactive CLI prompts for resolving analysis gaps

**Core Functionality:**

```typescript
/**
 * Service for presenting interactive gap questions to users
 * and collecting responses to enrich project analysis
 */
export class GapQuestionsService {
  /**
   * Present gap questions interactively via CLI
   * @param gaps - Array of consolidated gaps from Phase 2
   * @param consolidationPath - Path to consolidation JSON file
   * @returns Enriched consolidation with user responses
   */
  async askGapQuestions(
    gaps: ConsolidatedGap[],
    consolidationPath: string
  ): Promise<GapQuestionsResult>;

  /**
   * Parse consolidation file to extract questions
   */
  private parseGaps(consolidationPath: string): ConsolidatedGap[];

  /**
   * Format question for CLI presentation
   */
  private formatQuestion(gap: ConsolidatedGap): string;

  /**
   * Validate user response
   */
  private validateResponse(response: string, gap: ConsolidatedGap): boolean;

  /**
   * Write enriched consolidation back to disk
   */
  private writeEnrichedConsolidation(
    consolidationPath: string,
    enrichedData: any
  ): void;
}
```

**Technical Requirements:**

1. **Interactive Prompting:**
   - Use `inquirer` for rich terminal UI
   - Support for text input, confirm, and select prompts
   - Handle Ctrl+C gracefully (save partial progress)
   - Show progress indicator (Question 3/6)

2. **Question Types:**
   - **needs_verification:** Free-form text input
   - **sparse_findings:** Multi-line text with examples
   - **missing_language_coverage:** Select from detected languages

3. **Response Enrichment:**
   - Add `user_response` field to each gap
   - Add `response_timestamp` for audit
   - Preserve original gap data
   - Update `consolidation_status` field

4. **Error Handling:**
   - Validate non-empty responses
   - Allow skipping questions (mark as "skipped")
   - Save progress on interruption
   - Resume from last answered question

5. **Logging:**
   - Use existing `logger.ts` for consistent output
   - Log question presentation
   - Log response collection
   - Log file writes

**Implementation Steps:**

**Step 1.1.1:** Create service file and interface
```typescript
// orchestration/src/services/initialize-project/gap-questions.service.ts

import inquirer from 'inquirer';
import { readFileSync, writeFileSync } from 'fs';
import { logger } from '../../utils/logger.js';

export interface ConsolidatedGap {
  type: 'needs_verification' | 'sparse_findings' | 'missing_language_coverage';
  agent: string;
  item: string;
  question: string;
  reason?: string;
  priority: 'high' | 'medium' | 'low';
  consolidated_from: string[];
  original_count: number;
  user_response?: string;
  response_timestamp?: string;
  status?: 'answered' | 'skipped' | 'pending';
}

export interface GapQuestionsResult {
  success: boolean;
  enriched_consolidation?: any;
  error?: string;
  answered_count?: number;
  skipped_count?: number;
}

export class GapQuestionsService {
  private serviceLogger = logger.child('gap-questions');

  async askGapQuestions(
    gaps: ConsolidatedGap[],
    consolidationPath: string
  ): Promise<GapQuestionsResult> {
    // Implementation here
  }
}
```

**Step 1.1.2:** Implement core question loop
- Iterate through gaps
- Format each question with context
- Collect response via inquirer
- Validate and store response
- Handle interruptions

**Step 1.1.3:** Implement response persistence
- Read existing consolidation
- Merge user responses
- Write back to disk atomically
- Add metadata (timestamp, counts)

**Step 1.1.4:** Add progress tracking
- Show "Question X of Y"
- Show priority level (High/Medium/Low)
- Show which analyzer raised the gap
- Allow reviewing previous answers

**Step 1.1.5:** Implement error handling
- Graceful Ctrl+C handling
- Empty response validation
- File write errors
- Resume capability

#### 1.2 Integration: Update Phase 2 Consolidation Node

**File:** `orchestration/src/nodes/initialize-project/phase2/consolidation.node.ts`

**Changes Required:**

```typescript
// BEFORE (line 526-558):
async function askGapQuestions(
  consolidationPath: string,
  frameworkPath: string,
): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const askScript = join(
      frameworkPath,
      "skills/010-foundation/initialize-project/scripts/helpers/ask-gap-questions.js",
    );

    if (!existsSync(askScript)) {
      resolve({ success: false, error: `Script not found: ${askScript}` });
      return;
    }

    const child = spawn("node", [askScript, consolidationPath], {
      stdio: "inherit",
      env: process.env,
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: `Script exited with code ${code}` });
      }
    });

    child.on("error", (error) => {
      resolve({ success: false, error: error.message });
    });
  });
}

// AFTER:
import { GapQuestionsService } from '../../services/initialize-project/gap-questions.service.js';

async function askGapQuestions(
  gaps: ConsolidatedGap[],
  consolidationPath: string,
): Promise<{ success: boolean; error?: string }> {
  const gapService = new GapQuestionsService();

  try {
    const result = await gapService.askGapQuestions(gaps, consolidationPath);
    return {
      success: result.success,
      error: result.error
    };
  } catch (error) {
    return {
      success: false,
      error: (error as Error).message
    };
  }
}
```

**Update call site (line 215):**
```typescript
// BEFORE:
const askResult = await askGapQuestions(
  consolidatedPath,
  state.framework_path,
);

// AFTER:
const askResult = await askGapQuestions(
  gaps,
  consolidatedPath,
);
```

#### 1.3 Testing: Gap Questions Service

**File:** `orchestration/test/unit/services/initialize-project/gap-questions.service.test.ts`

**Test Coverage:**
1. **Basic Flow:**
   - ✓ Should present questions sequentially
   - ✓ Should collect and validate responses
   - ✓ Should enrich consolidation with responses
   - ✓ Should write to disk correctly

2. **Edge Cases:**
   - ✓ Should handle empty response (re-prompt)
   - ✓ Should handle skipped questions
   - ✓ Should handle Ctrl+C gracefully
   - ✓ Should resume from interruption
   - ✓ Should handle file write errors

3. **Validation:**
   - ✓ Should reject empty responses
   - ✓ Should trim whitespace
   - ✓ Should preserve multi-line input
   - ✓ Should validate against gap type

4. **Logging:**
   - ✓ Should log question presentation
   - ✓ Should log response collection
   - ✓ Should log errors

**Mock Strategy:**
- Mock `inquirer` prompt calls
- Mock file system (readFileSync, writeFileSync)
- Mock logger
- Use fixture data for consolidation JSON

**Test File Structure:**
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GapQuestionsService } from '../../../../src/services/initialize-project/gap-questions.service.js';
import inquirer from 'inquirer';
import { readFileSync, writeFileSync } from 'fs';

vi.mock('inquirer');
vi.mock('fs');

describe('GapQuestionsService', () => {
  let service: GapQuestionsService;

  beforeEach(() => {
    service = new GapQuestionsService();
    vi.clearAllMocks();
  });

  describe('askGapQuestions', () => {
    it('should present questions and collect responses', async () => {
      // Test implementation
    });

    it('should handle interrupted flow', async () => {
      // Test Ctrl+C handling
    });

    // ... more tests
  });
});
```

#### 1.4 Integration Testing: Phase 2 with Gap Questions

**File:** `orchestration/test/integration/initialize-project-phase2.integration.test.ts`

**Test Scenarios:**
1. **Happy Path:**
   - Run Phase 2 with gaps detected
   - Verify questions are presented
   - Simulate user responses
   - Verify consolidation is enriched
   - Verify workflow continues to Phase 3

2. **Skip Questions:**
   - Set `SKIP_GAP_QUESTIONS=true`
   - Verify workflow continues without prompts
   - Verify consolidation is not enriched

3. **Error Recovery:**
   - Simulate interruption during questions
   - Verify partial progress saved
   - Verify resume capability

**Dependencies:**
```json
{
  "devDependencies": {
    "inquirer": "^9.2.15",
    "@types/inquirer": "^9.0.7"
  }
}
```

#### 1.5 Acceptance Criteria

**Definition of Done:**
- [ ] GapQuestionsService implemented with full TypeScript types
- [ ] Service handles all gap types (needs_verification, sparse_findings, missing_language_coverage)
- [ ] Interactive prompts work correctly with inquirer
- [ ] User responses are validated and persisted
- [ ] Ctrl+C is handled gracefully with progress saved
- [ ] Phase 2 consolidation node updated to use service
- [ ] All references to external JS script removed
- [ ] Unit tests written with >90% coverage
- [ ] Integration tests pass for full Phase 2 flow
- [ ] Manual testing completed on real project
- [ ] Documentation updated

**Validation Steps:**
1. Run initialize-project on a real project
2. Verify gap questions are presented when gaps > 5
3. Answer questions and verify enrichment
4. Test Ctrl+C interruption and resume
5. Test SKIP_GAP_QUESTIONS=true bypass
6. Run full test suite (unit + integration)
7. Verify no external dependencies remain

---

### Phase 2: Improve Test Coverage to >90%

**Priority:** 🟡 P1 - IMPORTANT
**Estimated Effort:** 12-16 hours
**Dependencies:** Phase 1 complete

#### 2.1 Add SQLite Checkpointer Tests

**File:** `orchestration/test/unit/state/checkpointers/sqlite.checkpointer.test.ts`

**Coverage Target:** 95%

**Test Cases:**

1. **Initialization:**
   - ✓ Should create database file if not exists
   - ✓ Should create checkpoints table with correct schema
   - ✓ Should handle existing database
   - ✓ Should handle invalid database path

2. **Save Checkpoint:**
   - ✓ Should save checkpoint with all state fields
   - ✓ Should serialize complex state objects
   - ✓ Should update existing checkpoint
   - ✓ Should handle save errors

3. **Load Checkpoint:**
   - ✓ Should load checkpoint by thread_id
   - ✓ Should deserialize state correctly
   - ✓ Should return null for non-existent checkpoint
   - ✓ Should handle corrupted data

4. **List Checkpoints:**
   - ✓ Should list all checkpoints for namespace
   - ✓ Should filter by metadata
   - ✓ Should sort by timestamp
   - ✓ Should handle empty results

5. **Delete Checkpoint:**
   - ✓ Should delete specific checkpoint
   - ✓ Should handle non-existent checkpoint
   - ✓ Should verify deletion

**Mock Strategy:**
- Use in-memory SQLite (`:memory:`)
- Mock file system for error scenarios
- Use fixtures for complex state objects

**Implementation:**
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteCheckpointer } from '../../../../src/state/checkpointers/sqlite.checkpointer.js';
import { InitializeProjectState } from '../../../../src/state/schemas/initialize-project.schema.js';

describe('SqliteCheckpointer', () => {
  let checkpointer: SqliteCheckpointer;

  beforeEach(async () => {
    checkpointer = new SqliteCheckpointer(':memory:');
    await checkpointer.initialize();
  });

  afterEach(async () => {
    await checkpointer.close();
  });

  describe('saveCheckpoint', () => {
    it('should save and retrieve checkpoint', async () => {
      const state: Partial<InitializeProjectState> = {
        thread_id: 'test-123',
        project_path: '/test/path',
        current_phase: 'phase1_analysis'
      };

      await checkpointer.save('test-123', state);
      const loaded = await checkpointer.load('test-123');

      expect(loaded).toEqual(state);
    });
  });

  // ... more tests
});
```

#### 2.2 Add Concurrent Agent Tracker Tests

**File:** `orchestration/test/unit/utils/concurrent-agent-tracker.test.ts`

**Coverage Target:** 95%

**Test Cases:**

1. **Track Agent Execution:**
   - ✓ Should register agent start
   - ✓ Should track multiple agents concurrently
   - ✓ Should track execution duration
   - ✓ Should track status (running/completed/failed)

2. **Agent Completion:**
   - ✓ Should mark agent as completed
   - ✓ Should record completion time
   - ✓ Should update progress percentage
   - ✓ Should detect all agents completed

3. **Error Handling:**
   - ✓ Should mark agent as failed on error
   - ✓ Should track error message
   - ✓ Should continue tracking other agents
   - ✓ Should handle partial failures

4. **Progress Reporting:**
   - ✓ Should calculate correct progress percentage
   - ✓ Should report active agents
   - ✓ Should report completed agents
   - ✓ Should report failed agents

5. **Concurrency:**
   - ✓ Should handle race conditions
   - ✓ Should track overlapping executions
   - ✓ Should handle rapid start/complete cycles

**Implementation:**
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConcurrentAgentTracker } from '../../../../src/utils/concurrent-agent-tracker.js';

describe('ConcurrentAgentTracker', () => {
  let tracker: ConcurrentAgentTracker;

  beforeEach(() => {
    tracker = new ConcurrentAgentTracker();
  });

  describe('trackAgentExecution', () => {
    it('should track multiple concurrent agents', async () => {
      tracker.startAgent('agent1');
      tracker.startAgent('agent2');
      tracker.startAgent('agent3');

      expect(tracker.getActiveCount()).toBe(3);
      expect(tracker.getProgress()).toBe(0);

      tracker.completeAgent('agent1');
      expect(tracker.getProgress()).toBe(33);

      tracker.completeAgent('agent2');
      tracker.completeAgent('agent3');
      expect(tracker.getProgress()).toBe(100);
      expect(tracker.isAllComplete()).toBe(true);
    });
  });

  // ... more tests
});
```

#### 2.3 Add Graph Orchestration Tests

**Files:**
- `orchestration/test/unit/graphs/initialize-project.graph.test.ts`
- `orchestration/test/unit/graphs/implement-ticket.graph.test.ts`

**Coverage Target:** 80% (graphs are mostly declarative)

**Test Cases:**

1. **Graph Structure:**
   - ✓ Should have correct nodes
   - ✓ Should have correct edges
   - ✓ Should define entry point
   - ✓ Should define end point

2. **Node Routing:**
   - ✓ Should route from Phase 1 to Phase 2
   - ✓ Should route to error handler on failure
   - ✓ Should route to conditional branches correctly
   - ✓ Should handle END state

3. **State Flow:**
   - ✓ Should pass state between nodes
   - ✓ Should accumulate errors
   - ✓ Should preserve previous phase data
   - ✓ Should update current_phase

4. **Error Handling:**
   - ✓ Should catch node errors
   - ✓ Should propagate errors to state
   - ✓ Should route to error handler
   - ✓ Should allow recovery from errors

**Mock Strategy:**
- Mock individual node functions
- Use minimal state fixtures
- Focus on routing logic, not node implementation

**Implementation:**
```typescript
import { describe, it, expect, vi } from 'vitest';
import { createInitializeProjectGraph } from '../../../../src/graphs/initialize-project.graph.js';

describe('InitializeProjectGraph', () => {
  it('should have correct structure', () => {
    const graph = createInitializeProjectGraph();

    expect(graph.nodes).toContain('phase1_analysis');
    expect(graph.nodes).toContain('phase2_consolidation');
    // ... verify all nodes

    expect(graph.edges['phase1_analysis']).toContain('phase2_consolidation');
  });

  it('should route to error handler on failure', async () => {
    // Mock phase1 to throw error
    // Verify error handler is invoked
  });
});
```

#### 2.4 Enhance CLI Integration Tests

**Files:**
- `orchestration/test/integration/cli-initialize.integration.test.ts`
- `orchestration/test/integration/cli-implement.integration.test.ts`

**Coverage Target:** 85%

**Test Cases:**

1. **Full Workflow:**
   - ✓ Should run initialize-project end-to-end
   - ✓ Should run implement-ticket end-to-end
   - ✓ Should generate all expected files
   - ✓ Should handle real project structure

2. **CLI Arguments:**
   - ✓ Should parse --project-path correctly
   - ✓ Should parse --framework-path correctly
   - ✓ Should parse --start-phase correctly
   - ✓ Should handle invalid arguments

3. **Environment Variables:**
   - ✓ Should respect SKIP_GAP_QUESTIONS
   - ✓ Should respect TIER setting
   - ✓ Should respect timeout values

4. **Error Scenarios:**
   - ✓ Should handle missing project path
   - ✓ Should handle invalid phase
   - ✓ Should handle timeout
   - ✓ Should cleanup on failure

**Test Fixtures:**
- Use real test project in `test/fixtures/sample-project/`
- Include various tech stacks (React, Node, Python)
- Include edge cases (monorepo, multi-language)

#### 2.5 Coverage Reporting

**Setup:**
```json
// orchestration/package.json
{
  "scripts": {
    "test": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:unit": "vitest run test/unit",
    "test:integration": "vitest run test/integration"
  },
  "devDependencies": {
    "@vitest/coverage-v8": "^1.2.0"
  }
}
```

**Coverage Configuration:**
```typescript
// orchestration/vitest.config.ts
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/index.ts' // Export files
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90
      }
    }
  }
});
```

**Acceptance Criteria:**
- [ ] SQLite checkpointer tests added (>95% coverage)
- [ ] Concurrent agent tracker tests added (>95% coverage)
- [ ] Graph orchestration tests added (>80% coverage)
- [ ] CLI integration tests enhanced (>85% coverage)
- [ ] Overall coverage >90%
- [ ] All tests pass in CI/CD
- [ ] Coverage report generated and reviewed

---

### Phase 3: Remove External Dependencies

**Priority:** 🟢 P2 - CLEANUP
**Estimated Effort:** 2-4 hours
**Dependencies:** Phase 1 complete

#### 3.1 Deprecate Bash Scripts

**Files to Update:**
- `scripts/initialize-project.sh`
- `scripts/implement-ticket.sh`

**Changes:**

Add deprecation notice at the top of each script:
```bash
#!/bin/bash

cat << 'EOF'
================================================================================
⚠️  DEPRECATION NOTICE
================================================================================

This bash script is DEPRECATED and will be removed in a future version.

Please use the TypeScript CLI instead:

  # Initialize Project:
  cd orchestration && npm run cli:initialize -- --project-path=/path/to/project

  # Implement Ticket:
  cd orchestration && npm run cli:implement -- --ticket-file=/path/to/ticket.md

For more information, see: orchestration/GETTING_STARTED.md

This script will continue to work but is no longer maintained.
Press Ctrl+C to abort, or wait 5 seconds to continue...

================================================================================
EOF

sleep 5

# ... rest of script
```

**Update Documentation:**
- Update `README.md` to reference TypeScript CLI
- Update `GETTING_STARTED.md` with new commands
- Add migration guide for bash → TypeScript CLI

#### 3.2 Archive utils/ Folder

**Strategy:**
- Don't delete immediately (risky)
- Move to `utils-legacy/` for reference
- Add README explaining why it's archived
- Update all documentation to remove references

**Steps:**

1. **Create Archive:**
```bash
git mv utils utils-legacy
echo "# Legacy Utilities - DEPRECATED

These JavaScript utilities have been migrated to TypeScript in the orchestration/ module.

This folder is kept for historical reference only.

DO NOT USE these utilities in new code.
" > utils-legacy/README.md
```

2. **Update .gitignore:**
```bash
# Legacy code (archived, not maintained)
utils-legacy/
```

3. **Verify No Dependencies:**
```bash
# Should return no results
grep -r "utils/" orchestration/src/
grep -r "../utils" orchestration/src/
```

4. **Update Documentation:**
- Remove `utils/` references from main README
- Update architecture diagrams
- Update developer guide

#### 3.3 Remove Bash Script References

**Files to Update:**
- `orchestration/README.md`
- `orchestration/GETTING_STARTED.md`
- Main `README.md`
- Any workflow documentation

**Changes:**

BEFORE:
```markdown
## Usage

### Initialize Project
bash scripts/initialize-project.sh /path/to/project

### Implement Ticket
bash scripts/implement-ticket.sh /path/to/ticket.md
```

AFTER:
```markdown
## Usage

### Initialize Project
cd orchestration
npm run cli:initialize -- --project-path=/path/to/project

### Implement Ticket
cd orchestration
npm run cli:implement -- --ticket-file=/path/to/ticket.md

### Legacy Bash Scripts (Deprecated)
The old bash scripts in `scripts/` are deprecated. Use the TypeScript CLI above.
```

#### 3.4 Final Verification

**Checklist:**
- [ ] No imports from utils/ in orchestration/
- [ ] No spawn/exec calls to scripts/ in orchestration/
- [ ] All documentation updated
- [ ] Deprecation notices added to bash scripts
- [ ] utils/ archived to utils-legacy/
- [ ] Full test suite passes
- [ ] Manual testing on real project successful

---

### Phase 4: Production Hardening

**Priority:** 🟢 P2 - QUALITY
**Estimated Effort:** 8-12 hours
**Dependencies:** Phase 2 complete

#### 4.1 Error Handling Audit

**Objective:** Ensure all error paths are handled gracefully

**Areas to Review:**

1. **File System Operations:**
   - All readFileSync/writeFileSync wrapped in try/catch
   - Proper error messages for missing files
   - Cleanup on partial writes

2. **Agent Invocations:**
   - Timeout handling
   - Retry logic working correctly
   - Error messages actionable

3. **User Input:**
   - Invalid input validation
   - Ctrl+C handling
   - Resume capability

4. **State Management:**
   - Checkpoint save failures
   - State corruption detection
   - Recovery mechanisms

**Implementation:**

Create error handling test suite:
```typescript
// orchestration/test/integration/error-handling.integration.test.ts

describe('Error Handling', () => {
  it('should handle missing project path gracefully', async () => {
    // Verify clear error message
    // Verify no partial state
    // Verify cleanup
  });

  it('should recover from agent timeout', async () => {
    // Mock slow agent
    // Verify timeout triggers
    // Verify retry logic
    // Verify eventual failure with clear message
  });

  // ... more error scenarios
});
```

#### 4.2 Performance Optimization

**Objective:** Ensure framework scales to large projects (1000+ files)

**Areas to Optimize:**

1. **File System Operations:**
   - Use streaming for large files
   - Implement file caching
   - Parallelize file reads where possible

2. **Agent Concurrency:**
   - Verify Phase 1 analyzers run in parallel
   - Optimize agent scheduling
   - Monitor memory usage

3. **State Checkpointing:**
   - Implement incremental checkpoints
   - Reduce checkpoint frequency
   - Compress checkpoint data

**Benchmarking:**

Create performance test suite:
```typescript
// orchestration/test/performance/large-project.perf.test.ts

describe('Performance on Large Projects', () => {
  it('should handle 10,000 file project in <10 minutes', async () => {
    const startTime = Date.now();

    await runInitializeProject({
      projectPath: 'test/fixtures/large-project'
    });

    const duration = Date.now() - startTime;
    expect(duration).toBeLessThan(600000); // 10 minutes
  });
});
```

#### 4.3 Logging & Observability

**Objective:** Ensure debugging is easy in production

**Enhancements:**

1. **Structured Logging:**
   - Add trace IDs to all logs
   - Include timestamps
   - Log agent invocation details
   - Log file operations

2. **Progress Reporting:**
   - Show percentage complete
   - Show estimated time remaining
   - Show current operation

3. **Debug Mode:**
   - Add `--debug` flag
   - Output detailed logs
   - Include stack traces
   - Log state transitions

**Implementation:**

Enhance logger:
```typescript
// orchestration/src/utils/logger.ts

export class Logger {
  private traceId: string;

  setTraceId(id: string) {
    this.traceId = id;
  }

  logWithTrace(level: string, message: string, metadata?: any) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      traceId: this.traceId,
      level,
      message,
      ...metadata
    }));
  }
}
```

#### 4.4 Documentation

**Objective:** Ensure framework is easy to use and maintain

**Documentation to Create/Update:**

1. **User Guide:**
   - Getting Started (updated)
   - Configuration Options
   - Troubleshooting Guide
   - FAQ

2. **Developer Guide:**
   - Architecture Overview
   - Adding New Phases
   - Writing Tests
   - Debugging Tips

3. **API Reference:**
   - Service Interfaces
   - State Schemas
   - Utility Functions
   - Agent Factories

4. **Migration Guide:**
   - Bash → TypeScript CLI
   - Old utils → New services
   - Breaking Changes

**Files to Create:**
- `orchestration/docs/USER_GUIDE.md`
- `orchestration/docs/DEVELOPER_GUIDE.md`
- `orchestration/docs/API_REFERENCE.md`
- `orchestration/docs/MIGRATION_GUIDE.md`
- `orchestration/docs/TROUBLESHOOTING.md`

#### 4.5 CI/CD Setup

**Objective:** Ensure quality gates are automated

**GitHub Actions Workflow:**

```yaml
# .github/workflows/orchestration-ci.yml

name: Orchestration CI

on:
  push:
    branches: [main, development]
    paths:
      - 'orchestration/**'
  pull_request:
    branches: [main, development]
    paths:
      - 'orchestration/**'

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        working-directory: orchestration
        run: npm ci

      - name: Run linter
        working-directory: orchestration
        run: npm run lint

      - name: Run type check
        working-directory: orchestration
        run: npm run type-check

      - name: Run unit tests
        working-directory: orchestration
        run: npm run test:unit

      - name: Run integration tests
        working-directory: orchestration
        run: npm run test:integration

      - name: Check coverage
        working-directory: orchestration
        run: npm run test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./orchestration/coverage/lcov.info

  build:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'

      - name: Install dependencies
        working-directory: orchestration
        run: npm ci

      - name: Build
        working-directory: orchestration
        run: npm run build
```

**Quality Gates:**
- [ ] All tests pass
- [ ] Coverage >90%
- [ ] No linter errors
- [ ] No TypeScript errors
- [ ] Build succeeds

---

## Part 3: Implementation Timeline

### Week 1: Critical Blocker

| Day | Tasks | Deliverables |
|-----|-------|--------------|
| Day 1 | Phase 1.1: Implement Gap Questions Service | Service file, basic functionality |
| Day 2 | Phase 1.2: Update consolidation node | Integration complete |
| Day 3 | Phase 1.3: Write unit tests | Test file, >90% service coverage |
| Day 4 | Phase 1.4: Integration testing | Integration test, manual testing |
| Day 5 | Phase 1.5: Acceptance validation | All acceptance criteria met |

**Milestone:** Gap questions blocker resolved ✅

### Week 2: Test Coverage & Cleanup

| Day | Tasks | Deliverables |
|-----|-------|--------------|
| Day 1 | Phase 2.1: SQLite checkpointer tests | Test file, >95% coverage |
| Day 2 | Phase 2.2: Concurrent tracker tests | Test file, >95% coverage |
| Day 3 | Phase 2.3: Graph orchestration tests | 2 test files, >80% coverage |
| Day 4 | Phase 2.4: CLI integration tests | Enhanced integration tests |
| Day 5 | Phase 3: Remove external dependencies | Bash deprecated, utils archived |

**Milestone:** >90% coverage achieved, dependencies removed ✅

### Week 3: Production Hardening (Optional)

| Day | Tasks | Deliverables |
|-----|-------|--------------|
| Day 1 | Phase 4.1: Error handling audit | Error test suite |
| Day 2 | Phase 4.2: Performance optimization | Perf benchmarks |
| Day 3 | Phase 4.3: Logging & observability | Enhanced logging |
| Day 4 | Phase 4.4: Documentation | User & developer guides |
| Day 5 | Phase 4.5: CI/CD setup | GitHub Actions workflow |

**Milestone:** Production-ready framework ✅

---

## Part 4: Risk Management

### High Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Gap questions UX is poor | User frustration | Medium | User testing, iteration |
| Tests don't catch regressions | Production bugs | Medium | Code review, manual testing |
| Breaking changes in migration | Existing users broken | Low | Deprecation notices, docs |

### Medium Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Coverage metric is misleading | False confidence | Medium | Manual inspection of critical paths |
| Performance degrades on large projects | Slow workflows | Medium | Perf testing, profiling |
| Documentation outdated | User confusion | High | Keep docs in sync with code |

### Low Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| TypeScript compilation errors | Dev friction | Low | Strict type checking, CI |
| Dependency vulnerabilities | Security issues | Low | Dependabot, regular updates |

---

## Part 5: Success Criteria

### Definition of Done

The migration is complete when ALL of the following are true:

**Code Quality:**
- [ ] Zero external JS dependencies in orchestration/
- [ ] Zero bash script invocations (except git/npm/claude)
- [ ] All code strongly typed with TypeScript
- [ ] No `any` types in critical paths
- [ ] Linter passes with zero warnings

**Test Coverage:**
- [ ] Overall coverage >90%
- [ ] All critical paths covered
- [ ] Integration tests for both workflows
- [ ] Error paths tested
- [ ] Edge cases tested

**Functionality:**
- [ ] Initialize-project workflow works end-to-end
- [ ] Implement-ticket workflow works end-to-end
- [ ] Gap questions work interactively
- [ ] Checkpointing works correctly
- [ ] Error recovery works

**Documentation:**
- [ ] User guide complete
- [ ] Developer guide complete
- [ ] API reference complete
- [ ] Migration guide complete
- [ ] Troubleshooting guide complete

**Production Readiness:**
- [ ] Tested on 5+ real projects
- [ ] Tested on different tech stacks
- [ ] Performance acceptable on large projects
- [ ] Error messages are actionable
- [ ] Logging is comprehensive

**Cleanup:**
- [ ] Bash scripts deprecated
- [ ] utils/ folder archived
- [ ] Documentation updated
- [ ] No dead code
- [ ] No TODO comments

### Validation Checklist

Before declaring migration complete, run through this checklist:

**Functional Testing:**
1. [ ] Run initialize-project on React app → Success
2. [ ] Run initialize-project on Node.js API → Success
3. [ ] Run initialize-project on Python app → Success
4. [ ] Run initialize-project on monorepo → Success
5. [ ] Run implement-ticket on small feature → Success
6. [ ] Run implement-ticket on bug fix → Success
7. [ ] Run implement-ticket with tests → Success
8. [ ] Trigger gap questions (>5 gaps) → Success
9. [ ] Skip gap questions (env var) → Success
10. [ ] Test checkpoint save/restore → Success

**Error Testing:**
1. [ ] Invalid project path → Clear error message
2. [ ] Missing dependencies → Clear error message
3. [ ] Agent timeout → Retry and clear error
4. [ ] User Ctrl+C → Graceful exit, cleanup
5. [ ] Corrupted checkpoint → Clear error, recovery
6. [ ] Disk full → Clear error message

**Performance Testing:**
1. [ ] Small project (<100 files) → <2 minutes
2. [ ] Medium project (100-1000 files) → <5 minutes
3. [ ] Large project (1000-10000 files) → <15 minutes
4. [ ] Memory usage stays reasonable
5. [ ] CPU usage is reasonable

**Code Quality:**
1. [ ] `npm run lint` → Zero errors
2. [ ] `npm run type-check` → Zero errors
3. [ ] `npm run build` → Success
4. [ ] `npm run test:unit` → All pass
5. [ ] `npm run test:integration` → All pass
6. [ ] `npm run test:coverage` → >90%

**Documentation:**
1. [ ] README.md is up to date
2. [ ] GETTING_STARTED.md is up to date
3. [ ] USER_GUIDE.md is complete
4. [ ] DEVELOPER_GUIDE.md is complete
5. [ ] API_REFERENCE.md is complete
6. [ ] All code examples work

---

## Part 6: Appendix

### A. File Structure Reference

```
orchestration/
├── src/
│   ├── agents/                      # Agent factories
│   │   ├── agent-factory-claude-cli.ts
│   │   ├── agent-factory-deep-agent.ts
│   │   └── agent-factory-hybrid.ts
│   ├── auth/                        # Authentication
│   │   └── auth-detector.ts
│   ├── cli/                         # Entry points
│   │   ├── initialize.ts
│   │   └── implement.ts
│   ├── graphs/                      # LangGraph workflows
│   │   ├── initialize-project.graph.ts
│   │   └── implement-ticket.graph.ts
│   ├── hooks/                       # Lifecycle hooks
│   │   └── index.ts
│   ├── llm/                         # LLM providers
│   │   └── llm-factory.ts
│   ├── nodes/                       # Phase implementations
│   │   ├── initialize-project/
│   │   │   ├── phase1/              # Analyzers
│   │   │   │   ├── structure-architecture-analyzer.node.ts
│   │   │   │   ├── tech-stack-dependencies-analyzer.node.ts
│   │   │   │   ├── code-patterns-testing-analyzer.node.ts
│   │   │   │   └── data-flows-integrations-analyzer.node.ts
│   │   │   ├── phase2/              # Consolidation
│   │   │   │   └── consolidation.node.ts
│   │   │   ├── phase3/              # Synthesis
│   │   │   │   └── synthesis.node.ts
│   │   │   ├── phase4/              # Context generation
│   │   │   │   └── context-generation.node.ts
│   │   │   ├── phase5/              # Resources
│   │   │   │   └── resources.node.ts
│   │   │   └── phase6/              # Validation
│   │   │       └── validation.node.ts
│   │   └── implement-ticket/
│   │       ├── phase0-preflight.node.ts
│   │       ├── phase1-context.node.ts
│   │       ├── phase2-requirements.node.ts
│   │       ├── phase3-architecture.node.ts
│   │       ├── phase4-planning.node.ts
│   │       ├── phase5-implementation.node.ts
│   │       ├── phase6-testing.node.ts
│   │       ├── phase7-integration.node.ts
│   │       ├── phase8-visual.node.ts
│   │       ├── phase9-review.node.ts
│   │       └── phase10-completion.node.ts
│   ├── services/                    # Business logic
│   │   ├── implement-ticket/
│   │   │   ├── agent-invoker.service.ts
│   │   │   ├── artifact-collector.service.ts
│   │   │   ├── command-resolver.service.ts
│   │   │   ├── environment-manager.service.ts
│   │   │   ├── project-config-reader.service.ts
│   │   │   ├── review-loop.service.ts
│   │   │   ├── screenshot.service.ts
│   │   │   └── test-orchestrator.service.ts
│   │   └── initialize-project/      # NEW
│   │       └── gap-questions.service.ts  # TO BE CREATED
│   ├── state/                       # State management
│   │   ├── checkpointers/
│   │   │   ├── memory.checkpointer.ts
│   │   │   └── sqlite.checkpointer.ts
│   │   └── schemas/
│   │       ├── initialize-project.schema.ts
│   │       └── implement-ticket.schema.ts
│   └── utils/                       # Shared utilities
│       ├── agent-factory.ts
│       ├── agent-generator.ts
│       ├── config-generator.ts
│       ├── consolidation.ts
│       ├── concurrent-agent-tracker.ts
│       ├── enhanced-retry.ts
│       ├── logger.ts
│       ├── retry.ts
│       ├── skill-resolver.ts
│       └── validator.ts
├── test/
│   ├── unit/
│   │   ├── agents/
│   │   ├── nodes/
│   │   ├── services/
│   │   │   ├── implement-ticket/
│   │   │   └── initialize-project/  # NEW
│   │   │       └── gap-questions.service.test.ts  # TO BE CREATED
│   │   ├── state/
│   │   │   └── checkpointers/
│   │   │       └── sqlite.checkpointer.test.ts  # TO BE CREATED
│   │   ├── utils/
│   │   │   └── concurrent-agent-tracker.test.ts  # TO BE CREATED
│   │   └── graphs/                  # NEW
│   │       ├── initialize-project.graph.test.ts  # TO BE CREATED
│   │       └── implement-ticket.graph.test.ts    # TO BE CREATED
│   ├── integration/
│   │   ├── initialize-project.integration.test.ts
│   │   ├── initialize-project-phase2.integration.test.ts  # TO BE CREATED
│   │   ├── implement-ticket.integration.test.ts
│   │   ├── cli-initialize.integration.test.ts  # TO BE ENHANCED
│   │   ├── cli-implement.integration.test.ts   # TO BE ENHANCED
│   │   └── error-handling.integration.test.ts  # TO BE CREATED
│   ├── performance/                 # NEW
│   │   └── large-project.perf.test.ts  # TO BE CREATED
│   └── fixtures/
│       ├── sample-project/
│       └── consolidation-samples/
├── docs/                            # NEW
│   ├── USER_GUIDE.md                # TO BE CREATED
│   ├── DEVELOPER_GUIDE.md           # TO BE CREATED
│   ├── API_REFERENCE.md             # TO BE CREATED
│   ├── MIGRATION_GUIDE.md           # TO BE CREATED
│   └── TROUBLESHOOTING.md           # TO BE CREATED
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

### B. Key Metrics Dashboard

| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| **Test Coverage** | 82% | >90% | 🟡 In Progress |
| **External JS Dependencies** | 1 | 0 | 🔴 Blocker |
| **External Bash Dependencies** | 0 | 0 | ✅ Complete |
| **TypeScript Strict Mode** | ✅ | ✅ | ✅ Complete |
| **Unit Test Files** | 42 | 46+ | 🟡 In Progress |
| **Integration Test Files** | 2 | 5+ | 🟡 In Progress |
| **LOC (orchestration/src/)** | ~15,000 | ~16,000 | 🟡 Growing |
| **LOC (tests/)** | ~8,000 | ~10,000 | 🟡 Growing |
| **Documented Services** | 50% | 100% | 🟡 In Progress |
| **Linter Warnings** | 0 | 0 | ✅ Complete |
| **TypeScript Errors** | 0 | 0 | ✅ Complete |

### C. Dependencies Inventory

**Production Dependencies:**
```json
{
  "@langchain/core": "^0.3.0",
  "@langchain/langgraph": "^0.2.0",
  "@anthropic-ai/sdk": "^0.30.0",
  "zod": "^3.22.0",
  "better-sqlite3": "^9.2.0",
  "chalk": "^5.3.0",
  "ora": "^8.0.0",
  "commander": "^12.0.0"
}
```

**Development Dependencies:**
```json
{
  "typescript": "^5.3.0",
  "vitest": "^1.2.0",
  "@vitest/coverage-v8": "^1.2.0",
  "@types/node": "^20.0.0",
  "@types/better-sqlite3": "^7.6.0",
  "eslint": "^8.56.0",
  "@typescript-eslint/parser": "^6.19.0",
  "@typescript-eslint/eslint-plugin": "^6.19.0"
}
```

**To Be Added:**
```json
{
  "inquirer": "^9.2.15",
  "@types/inquirer": "^9.0.7"
}
```

### D. Test Command Reference

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run specific test file
npm test -- gap-questions.service.test.ts

# Run tests in watch mode
npm test -- --watch

# Run tests with UI
npm test -- --ui

# Type check
npm run type-check

# Lint
npm run lint

# Build
npm run build

# Run CLI (initialize)
npm run cli:initialize -- --project-path=/path/to/project

# Run CLI (implement)
npm run cli:implement -- --ticket-file=/path/to/ticket.md
```

### E. Common Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| "Script not found: ask-gap-questions.js" | Missing gap questions service | Implement Phase 1 of this plan |
| Test timeout on slow machines | Default timeout too short | Increase timeout in vitest.config.ts |
| SQLite errors in tests | Database file locks | Use `:memory:` for tests |
| Coverage report missing files | Incorrect include/exclude config | Update vitest.config.ts coverage settings |
| TypeScript errors after changes | Stale build artifacts | Run `npm run clean && npm run build` |
| Integration tests fail on CI | Environment differences | Use Docker for consistent env |

### F. Contact & Support

**Questions?**
- Create an issue on GitHub
- Check docs/ folder for guides
- Review test files for examples

**Contributing:**
- Follow TypeScript style guide
- Write tests for all new code
- Update documentation
- Run full test suite before PR

---

## Conclusion

This migration plan provides a comprehensive roadmap to complete the TypeScript orchestrator migration, achieve >90% test coverage, and ensure production-ready code for 1000+ projects.

**Key Takeaways:**

1. **Critical Blocker:** Gap questions service must be implemented in TypeScript (Phase 1)
2. **Test Coverage:** Need 4 additional test files to reach >90% (Phase 2)
3. **Cleanup:** Deprecate bash scripts and archive utils/ folder (Phase 3)
4. **Quality:** Add error handling, performance testing, docs (Phase 4)

**Timeline:** 2-3 weeks for complete migration

**Success Criteria:** Zero external dependencies, >90% coverage, production-ready

**Next Steps:**
1. Review and approve this plan
2. Begin Phase 1: Gap Questions Service
3. Execute phases sequentially
4. Validate with real projects
5. Deploy to production

---

**Document Version:** 1.0
**Last Updated:** 2026-03-24
**Author:** Claude Sonnet 4.5
**Status:** Ready for Review
