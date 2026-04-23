# Phase 10: Testing & Validation

## Objective

Comprehensive testing of the Codex integration across all layers: unit tests, integration tests, and end-to-end validation.

## Why This Phase Exists

Every previous phase introduces new code paths. Without testing:
- Claude regression could go undetected
- Codex edge cases (different output formats, auth patterns) could fail silently
- Hook translation errors could break the retry loop
- Path resolution bugs could write to wrong directories

## Dependencies

- Phase 1-9 (all implementation phases)

## Steps

### Step 10.1: Unit Tests for Provider Abstraction (Phase 1)

**Files to create:**
- `orchestration/test/unit/providers/claude-provider.test.ts`
- `orchestration/test/unit/providers/codex-provider.test.ts`
- `orchestration/test/unit/providers/provider-factory.test.ts`

**Test cases:**

```typescript
// claude-provider.test.ts
describe('ClaudeProvider', () => {
  it('returns correct paths', () => {
    const provider = new ClaudeProvider();
    expect(provider.getPaths().configDir).toBe('.claude');
    expect(provider.getPaths().instructionFile).toBe('CLAUDE.md');
  });

  it('maps models correctly', () => {
    const provider = new ClaudeProvider();
    expect(provider.mapModelToCLI('sonnet-latest')).toBe('sonnet');
    expect(provider.mapModelToCLI('opus-latest')).toBe('opus');
    expect(provider.mapModelToCLI('haiku-latest')).toBe('haiku');
  });

  it('builds CLI args with tools', () => {
    const provider = new ClaudeProvider();
    const args = provider.buildCLIArgs({
      agentFilePath: '/path/to/agent.md',
      model: 'sonnet',
      inputPrompt: 'test',
      tools: 'Read,Grep,Glob',
      sessionId: 'abc-123',
      isRetry: false,
    });
    expect(args).toContain('--agent');
    expect(args).toContain('--tools');
    expect(args).not.toContain('--dangerously-skip-permissions');
  });

  it('builds CLI args without tools (bypass permissions)', () => {
    const args = provider.buildCLIArgs({ ..., tools: null });
    expect(args).toContain('--dangerously-skip-permissions');
  });
});

// codex-provider.test.ts
describe('CodexProvider', () => {
  it('returns correct paths', () => {
    const provider = new CodexProvider();
    expect(provider.getPaths().configDir).toBe('.codex');
    expect(provider.getPaths().instructionFile).toBe('AGENTS.md');
  });

  it('maps models correctly', () => {
    expect(provider.mapModelToCLI('gpt5-latest')).toBe('gpt-5.4');
    expect(provider.mapModelToCLI('gpt5-mini')).toBe('gpt-5.4-mini');
  });

  it('builds CLI args with exec subcommand', () => {
    const args = provider.buildCLIArgs({ ... });
    expect(args[0]).toBe('exec');
    expect(args).toContain('--yolo');
    expect(args).toContain('--json');
  });

  it('detects rate limiting from stderr', () => {
    const result = provider.detectRateLimit('', 'Error 429: rate limit exceeded');
    expect(result?.isRateLimited).toBe(true);
  });
});

// provider-factory.test.ts
describe('ProviderFactory', () => {
  it('detects Claude from ANTHROPIC_API_KEY', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    const provider = await ProviderFactory.detect();
    expect(provider.getConfig().provider).toBe(Provider.CLAUDE);
    delete process.env.ANTHROPIC_API_KEY;
  });

  it('detects Codex from OPENAI_API_KEY', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    const provider = await ProviderFactory.detect();
    expect(provider.getConfig().provider).toBe(Provider.CODEX);
    delete process.env.OPENAI_API_KEY;
  });

  it('respects PROVIDER env var override', async () => {
    process.env.PROVIDER = 'codex';
    const provider = await ProviderFactory.detect();
    expect(provider.getConfig().provider).toBe(Provider.CODEX);
    delete process.env.PROVIDER;
  });
});
```

### Step 10.2: Unit Tests for Auth Detection (Phase 2)

**File to modify:** `orchestration/test/unit/auth/auth-detector.test.ts` (create or update)

**Test cases:**
- `isCodexCLIAvailable()` returns true when codex binary exists
- `isCodexCLIAuthenticated()` checks auth.json correctly
- `detectAuthMode()` returns CODEX_CLI when codex is authenticated
- `detectAuthMode()` prefers API key over CLI
- `getAuthErrorMessage()` includes both Claude and Codex options

### Step 10.3: Unit Tests for Codex CLI Agent (Phase 3)

**File to create:** `orchestration/test/unit/utils/shared/agent-factory/codex-cli-agent-impl.test.ts`

**Test cases:**
- `parseCodexJsonOutput()` correctly extracts final message
- `createCodexCLIAgentImpl()` creates agent with correct config
- Agent invocation builds correct CLI arguments
- Rate limit detection for Codex-specific patterns
- Timeout handling works correctly
- Process cleanup on abort

### Step 10.4: Unit Tests for Provider Paths (Phase 4)

**File to create:** `orchestration/test/unit/utils/provider-paths.test.ts`

**Test cases:**
```typescript
describe('provider-paths', () => {
  afterEach(() => setActiveProvider(Provider.CLAUDE));

  it('resolves Claude paths by default', () => {
    expect(resolveConfigPath('/project')).toBe('/project/.claude');
    expect(resolveInstructionFilePath('/project')).toBe('/project/.claude/CLAUDE.md');
  });

  it('resolves Codex paths when active', () => {
    setActiveProvider(Provider.CODEX);
    expect(resolveConfigPath('/project')).toBe('/project/.codex');
    expect(resolveInstructionFilePath('/project')).toBe('/project/.codex/AGENTS.md');
  });

  it('resolves nested paths correctly', () => {
    setActiveProvider(Provider.CODEX);
    expect(resolveConfigPath('/project', 'skills', 'my-skill')).toBe('/project/.codex/skills/my-skill');
  });
});
```

### Step 10.5: Unit Tests for Hook Translation (Phase 6)

**File to create:** `orchestration/test/unit/hooks/hook-translator.test.ts`

**Test cases:**
- Claude settings.json correctly parsed to framework format
- Framework format correctly translated to Codex hooks.json
- `${FRAMEWORK_PATH}` placeholder is resolved
- Multiple hooks are handled
- Event name mapping is correct

### Step 10.6: Update Existing Tests

**Files to modify:** All existing test files that hardcode `.claude/` paths

Many existing tests use hardcoded `.claude/` paths in their fixtures and assertions. These tests should continue to work (they test the Claude path), but we should also add parallel test cases for the Codex path.

**Approach:** For each test file, add a describe block that sets `Provider.CODEX` and verifies the same operations work with `.codex/` paths.

**Key test files to update:**
- `orchestration/test/unit/nodes/initialize-project/phase4/context-generation.test.ts`
- `orchestration/test/unit/nodes/initialize-project/phase5/agent-generator.test.ts`
- `orchestration/test/unit/nodes/initialize-project/phase5/skill-resolver.test.ts`
- `orchestration/test/unit/nodes/initialize-project/phase5/resources.test.ts`
- `orchestration/test/unit/nodes/initialize-project/phase6/validation.test.ts`
- `orchestration/test/unit/services/framework/config-updater.service.test.ts`
- `orchestration/test/unit/services/framework/sync-helpers.service.test.ts`
- `orchestration/test/unit/services/implement-ticket/project-config-reader.service.test.ts`

### Step 10.7: Integration Tests

**File to create:** `orchestration/test/integration/codex-integration.test.ts`

**Why:** End-to-end test that verifies the full initialize-project flow with Codex provider.

```typescript
describe('Codex Integration', () => {
  const testProjectPath = resolve(__dirname, '../fixtures/automation-projects/minimal-project');

  beforeAll(() => {
    // Skip if Codex CLI not available
    try {
      execSync('which codex', { stdio: 'ignore' });
    } catch {
      console.log('Skipping Codex integration tests: codex CLI not installed');
      return;
    }
  });

  it('initializes project with Codex provider', async () => {
    setActiveProvider(Provider.CODEX);
    // Run initialization
    // Verify .codex/ directory created
    // Verify AGENTS.md generated
    // Verify framework-config.json in .codex/
    // Verify skills synced to .codex/skills/
    // Verify agents synced to .codex/agents/
  });
});
```

### Step 10.8: Test Fixtures

**Files to create:**
- `orchestration/test/fixtures/codex-settings/hooks.json` - Sample Codex hooks config
- `orchestration/test/fixtures/codex-settings/config.toml` - Sample Codex config

### Step 10.9: CLI Smoke Tests

**Create manual test scripts:**

```bash
#!/bin/bash
# tests/smoke/test-codex-init.sh
# Smoke test for Codex provider initialization

set -e

# Create temp project
TEMP_PROJECT=$(mktemp -d)
mkdir -p "$TEMP_PROJECT/src"
echo '{ "name": "test-project" }' > "$TEMP_PROJECT/package.json"
echo 'console.log("hello")' > "$TEMP_PROJECT/src/index.ts"

# Initialize with Codex
./scripts/initialize-project.sh "$TEMP_PROJECT" --provider codex

# Verify artifacts
[ -d "$TEMP_PROJECT/.codex" ] || { echo "FAIL: .codex/ not created"; exit 1; }
[ -f "$TEMP_PROJECT/.codex/AGENTS.md" ] || { echo "FAIL: AGENTS.md not created"; exit 1; }
[ -f "$TEMP_PROJECT/.codex/framework-config.json" ] || { echo "FAIL: config not created"; exit 1; }
[ -d "$TEMP_PROJECT/.codex/skills" ] || { echo "FAIL: skills/ not created"; exit 1; }
[ -d "$TEMP_PROJECT/.codex/agents" ] || { echo "FAIL: agents/ not created"; exit 1; }

echo "PASS: Codex initialization smoke test passed"

# Cleanup
rm -rf "$TEMP_PROJECT"
```

### Step 10.10: Regression Tests for Claude

**Why:** Ensure zero regression in existing Claude behavior.

Run the full existing test suite:
```bash
pnpm --filter orchestration test:unit
```

All existing tests must pass without modification (except those explicitly updated to support both providers).

## Files Created/Modified

| Action | File | Why |
|--------|------|-----|
| CREATE | `orchestration/test/unit/providers/claude-provider.test.ts` | Provider unit tests |
| CREATE | `orchestration/test/unit/providers/codex-provider.test.ts` | Provider unit tests |
| CREATE | `orchestration/test/unit/providers/provider-factory.test.ts` | Factory unit tests |
| CREATE | `orchestration/test/unit/utils/shared/agent-factory/codex-cli-agent-impl.test.ts` | Codex CLI tests |
| CREATE | `orchestration/test/unit/utils/provider-paths.test.ts` | Path resolver tests |
| CREATE | `orchestration/test/unit/hooks/hook-translator.test.ts` | Hook translation tests |
| CREATE | `orchestration/test/integration/codex-integration.test.ts` | E2E integration test |
| CREATE | `orchestration/test/fixtures/codex-settings/hooks.json` | Test fixture |
| CREATE | `tests/smoke/test-codex-init.sh` | Smoke test script |
| MODIFY | Multiple existing test files | Add Codex provider test cases |

## Acceptance Criteria

1. All new unit tests pass
2. All existing unit tests pass unchanged (zero regression)
3. Integration test initializes a project with Codex successfully
4. Smoke test verifies correct directory structure
5. Test coverage for provider paths is >90%
6. Hook translation has comprehensive test coverage
7. Codex JSON output parsing is tested with real Codex output samples

## Notes for Implementer

- Run existing tests first (`pnpm --filter orchestration test:unit`) to establish baseline
- Codex CLI integration tests require `codex` binary. Use `beforeAll` guards to skip if not available.
- Mock `child_process.execSync` for unit tests that check CLI availability
- Use Vitest's `vi.mock()` for fs operations in path resolution tests
- The existing test structure mirrors the `src/` directory. Follow the same pattern for new tests.
- For the smoke test, ensure cleanup happens even on failure (use `trap`)
