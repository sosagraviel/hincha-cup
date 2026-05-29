import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  FRAMEWORK_AGENT_READ_ALLOW_PLACEHOLDER,
  FRAMEWORK_EXCLUDED_DENY_RULES_PLACEHOLDER,
  analyzerExcludedDirsOverride,
  analyzerReadableTempPaths,
  buildClaudeAllowReadRules,
  buildClaudeDenyRules,
  renderDenyRulesPlaceholderValue,
} from '../../../../../src/services/framework/permissions/excluded-paths.js';

describe('buildClaudeDenyRules', () => {
  let projectPath: string;
  let frameworkPath: string;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), 'excluded-paths-proj-'));
    frameworkPath = mkdtempSync(join(tmpdir(), 'excluded-paths-fw-'));
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
    rmSync(frameworkPath, { recursive: true, force: true });
  });

  it('emits BOTH top-level and any-depth Read rules per excluded directory', () => {
    const rules = buildClaudeDenyRules(projectPath, frameworkPath);

    // node_modules: both forms must be present so workspace tools that
    // hoist (pnpm) and tools that don't (yarn classic) are both covered.
    expect(rules).toContain('Read(./node_modules/**)');
    expect(rules).toContain('Read(**/node_modules/**)');
  });

  it('covers the framework checkout (qubika-agentic-framework or basename of frameworkPath)', () => {
    const rules = buildClaudeDenyRules(projectPath, frameworkPath);
    const fwBase = frameworkPath.split('/').pop()!;
    expect(rules).toContain(`Read(./${fwBase}/**)`);
    expect(rules).toContain(`Read(**/${fwBase}/**)`);
  });

  it('covers .git, dist, build, .next, .venv, target, vendor, etc. (every load-bearing dir)', () => {
    const rules = buildClaudeDenyRules(projectPath, frameworkPath);
    const expected = [
      '.git',
      'dist',
      'build',
      'out',
      '__pycache__',
      '.venv',
      'venv',
      'env',
      'vendor',
      'target',
      '.next',
      '.nuxt',
      '.cache',
      'coverage',
      'bin',
      'obj',
      '.terraform',
      'site-packages',
      'pkg',
    ];
    for (const dir of expected) {
      expect(rules).toContain(`Read(./${dir}/**)`);
      expect(rules).toContain(`Read(**/${dir}/**)`);
    }
  });

  it('covers provider-managed dirs (.claude, .codex, .claude-temp, etc.)', () => {
    const rules = buildClaudeDenyRules(projectPath, frameworkPath);
    expect(rules).toContain('Read(./.claude/**)');
    expect(rules).toContain('Read(./.codex/**)');
    expect(rules).toContain('Read(./.claude-temp/**)');
    expect(rules).toContain('Read(./.codex-temp/**)');
  });

  it('returns a non-empty list (regression guard against an empty source)', () => {
    const rules = buildClaudeDenyRules(projectPath, frameworkPath);
    expect(rules.length).toBeGreaterThanOrEqual(40);
  });

  it('emits exactly two rules per directory (top-level + any-depth)', () => {
    const rules = buildClaudeDenyRules(projectPath, frameworkPath);
    expect(rules.length % 2).toBe(0);
    // Top-level + any-depth pair must appear together for each dir name.
    for (let i = 0; i < rules.length; i += 2) {
      const top = rules[i];
      const any = rules[i + 1];
      const topMatch = /^Read\(\.\/([^)]+)\/\*\*\)$/.exec(top);
      const anyMatch = /^Read\(\*\*\/([^)]+)\/\*\*\)$/.exec(any);
      expect(topMatch).not.toBeNull();
      expect(anyMatch).not.toBeNull();
      expect(topMatch![1]).toBe(anyMatch![1]);
    }
  });

  describe('stack-agnostic — no language or framework leak', () => {
    // The deny-rule list must not encode language-specific or framework-
    // specific assumptions. Every entry is a generic dependency / build /
    // cache / framework directory NAME, not a language extension or
    // toolchain-specific path.
    it('contains no language-specific extensions or paths', () => {
      const rules = buildClaudeDenyRules(projectPath, frameworkPath);
      const joined = rules.join('\n');
      // Sample tokens that would indicate stack-specific assumptions:
      const forbidden = [
        '*.ts',
        '*.tsx',
        '*.py',
        '*.go',
        '*.java',
        'src/**',
        'app/**',
        'cmd/**',
        'spec/**',
      ];
      for (const tok of forbidden) {
        expect(joined).not.toContain(tok);
      }
    });
  });
});

describe('renderDenyRulesPlaceholderValue', () => {
  it('emits a comma-separated list of JSON-encoded strings (no surrounding brackets)', () => {
    const out = renderDenyRulesPlaceholderValue([
      'Read(./node_modules/**)',
      'Read(**/node_modules/**)',
    ]);
    expect(out).toBe('"Read(./node_modules/**)", "Read(**/node_modules/**)"');
  });

  it('produces output that, when wrapped in [...], is valid JSON', () => {
    const rules = ['Read(./a/**)', 'Read(./b/**)', 'Read(**/c/**)'];
    const fragment = renderDenyRulesPlaceholderValue(rules);
    const parsed = JSON.parse(`[${fragment}]`);
    expect(parsed).toEqual(rules);
  });

  it('escapes embedded quotes and backslashes correctly (defensive)', () => {
    // No real rule should contain quotes or backslashes, but JSON.stringify
    // handles them anyway. Smoke test: valid JSON output for any input.
    const fragment = renderDenyRulesPlaceholderValue([
      'Read(./weird "dir"/**)',
      'Read(./back\\slash/**)',
    ]);
    expect(() => JSON.parse(`[${fragment}]`)).not.toThrow();
  });

  it('returns empty string when the input is an empty array', () => {
    expect(renderDenyRulesPlaceholderValue([])).toBe('');
  });
});

describe('FRAMEWORK_EXCLUDED_DENY_RULES_PLACEHOLDER', () => {
  it('is the exact token settings.json files use', () => {
    expect(FRAMEWORK_EXCLUDED_DENY_RULES_PLACEHOLDER).toBe('"${FRAMEWORK_EXCLUDED_DENY_RULES}"');
  });
});

describe('end-to-end placeholder substitution shape', () => {
  it('settings.json with placeholder, after substitution, produces valid JSON', () => {
    // Simulates what cli-agent-impl.ts does at spawn time.
    const settingsBefore = JSON.stringify(
      {
        permissions: { deny: ['${FRAMEWORK_EXCLUDED_DENY_RULES}'] },
        hooks: { PreToolUse: [], Stop: [] },
      },
      null,
      2,
    );

    const tmpProject = mkdtempSync(join(tmpdir(), 'sub-test-proj-'));
    const tmpFw = mkdtempSync(join(tmpdir(), 'sub-test-fw-'));
    try {
      const rules = buildClaudeDenyRules(tmpProject, tmpFw);
      const placeholderValue = renderDenyRulesPlaceholderValue(rules);
      const settingsAfter = settingsBefore.replace(
        /"\$\{FRAMEWORK_EXCLUDED_DENY_RULES\}"/g,
        placeholderValue,
      );

      // The substituted file must parse as JSON.
      const parsed = JSON.parse(settingsAfter);

      // The deny array must contain the expanded rules in order.
      expect(parsed.permissions.deny).toEqual(rules);

      // And the placeholder token must be gone.
      expect(settingsAfter).not.toContain('${FRAMEWORK_EXCLUDED_DENY_RULES}');
    } finally {
      rmSync(tmpProject, { recursive: true, force: true });
      rmSync(tmpFw, { recursive: true, force: true });
    }
  });
});

describe('buildClaudeDenyRules — excludedDirsOverride', () => {
  let projectPath: string;
  let frameworkPath: string;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), 'excluded-paths-override-proj-'));
    frameworkPath = mkdtempSync(join(tmpdir(), 'excluded-paths-override-fw-'));
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
    rmSync(frameworkPath, { recursive: true, force: true });
  });

  it('omits `.claude-temp` and `.codex-temp` from deny rules when the override drops them', () => {
    // The Phase 3 synthesizer drops the two provider temp dirs from its
    // exclusion list so it can read composer views + the consolidation
    // file. Without the override threading through to deny rules, the
    // settings.json deny would still block every `.claude-temp` read.
    const baseline = buildClaudeDenyRules(projectPath, frameworkPath);
    expect(baseline).toContain('Read(./.claude-temp/**)');
    expect(baseline).toContain('Read(**/.claude-temp/**)');
    expect(baseline).toContain('Read(./.codex-temp/**)');
    expect(baseline).toContain('Read(**/.codex-temp/**)');

    const override = ['node_modules', '.git', 'dist', 'qubika-agentic-framework'];
    const restricted = buildClaudeDenyRules(projectPath, frameworkPath, override);

    // The override-driven set carries ONLY the four supplied dirs (× 2
    // forms each = 8 rules).
    expect(restricted).toEqual([
      'Read(./node_modules/**)',
      'Read(**/node_modules/**)',
      'Read(./.git/**)',
      'Read(**/.git/**)',
      'Read(./dist/**)',
      'Read(**/dist/**)',
      'Read(./qubika-agentic-framework/**)',
      'Read(**/qubika-agentic-framework/**)',
    ]);

    // And critically: NO `.claude-temp` rules. The synthesizer's reads
    // must not be silently denied by an over-broad deny list.
    expect(restricted.some((r) => r.includes('.claude-temp'))).toBe(false);
    expect(restricted.some((r) => r.includes('.codex-temp'))).toBe(false);
    expect(restricted.length).toBeLessThan(baseline.length);
  });

  it('treats an empty override as "deny nothing" (every dir is exempt)', () => {
    // Edge case: an empty array is a meaningful override — "the caller
    // wants no deny rules at all" — distinct from `undefined` which
    // means "fall back to the project default".
    const empty = buildClaudeDenyRules(projectPath, frameworkPath, []);
    expect(empty).toEqual([]);
  });

  it('falls back to the project default when override is undefined', () => {
    const explicitUndefined = buildClaudeDenyRules(projectPath, frameworkPath, undefined);
    const noArg = buildClaudeDenyRules(projectPath, frameworkPath);
    expect(explicitUndefined).toEqual(noArg);
    expect(explicitUndefined).toContain('Read(./node_modules/**)');
  });

  it('emits BOTH top-level and any-depth forms for every override entry', () => {
    const restricted = buildClaudeDenyRules(projectPath, frameworkPath, ['target']);
    expect(restricted).toContain('Read(./target/**)');
    expect(restricted).toContain('Read(**/target/**)');
    expect(restricted).toHaveLength(2);
  });

  it('cleans whitespace / leading slashes in override entries (defensive)', () => {
    const restricted = buildClaudeDenyRules(projectPath, frameworkPath, ['  /weird/  ', 'normal']);
    expect(restricted).toContain('Read(./weird/**)');
    expect(restricted).toContain('Read(**/weird/**)');
    expect(restricted).toContain('Read(./normal/**)');
    expect(restricted).toContain('Read(**/normal/**)');
  });
});

describe('analyzerReadableTempPaths', () => {
  it('returns absolute file paths under both .claude-temp and .codex-temp for inspection + prefetch', () => {
    const paths = analyzerReadableTempPaths('/abs/project');
    expect(paths).toEqual([
      '/abs/project/.claude-temp/initialize-project/project-inspection.json',
      '/abs/project/.claude-temp/initialize-project/graph-prefetch.json',
      '/abs/project/.codex-temp/initialize-project/project-inspection.json',
      '/abs/project/.codex-temp/initialize-project/graph-prefetch.json',
    ]);
  });

  it('only exposes the two well-known seed files — no globs, no directories', () => {
    const paths = analyzerReadableTempPaths('/p');
    for (const p of paths) {
      expect(p).not.toContain('*');
      expect(p.endsWith('.json')).toBe(true);
    }
  });
});

describe('buildClaudeAllowReadRules', () => {
  it('renders Read() rules with the exact absolute path supplied', () => {
    const rules = buildClaudeAllowReadRules([
      '/abs/project/.claude-temp/initialize-project/project-inspection.json',
      '/abs/project/.claude-temp/initialize-project/graph-prefetch.json',
    ]);
    expect(rules).toEqual([
      'Read(/abs/project/.claude-temp/initialize-project/project-inspection.json)',
      'Read(/abs/project/.claude-temp/initialize-project/graph-prefetch.json)',
    ]);
  });

  it('returns an empty array on empty input (no implicit defaults)', () => {
    expect(buildClaudeAllowReadRules([])).toEqual([]);
  });

  it('throws on glob characters — the allow boundary must be surgical', () => {
    expect(() => buildClaudeAllowReadRules(['/abs/**/inspection.json'])).toThrow(/glob/i);
    expect(() => buildClaudeAllowReadRules(['/abs/?-inspection.json'])).toThrow(/glob/i);
  });

  it('survives placeholder substitution end-to-end', () => {
    const settingsBefore = JSON.stringify(
      {
        permissions: {
          allow: ['${FRAMEWORK_AGENT_READ_ALLOW}'],
          deny: ['${FRAMEWORK_EXCLUDED_DENY_RULES}'],
        },
      },
      null,
      2,
    );

    const allowPaths = analyzerReadableTempPaths('/abs/project');
    const allowRules = buildClaudeAllowReadRules(allowPaths);
    const allowValue = renderDenyRulesPlaceholderValue(allowRules);
    const denyValue = renderDenyRulesPlaceholderValue([
      'Read(./node_modules/**)',
      'Read(**/node_modules/**)',
    ]);
    const settingsAfter = settingsBefore
      .replace(/"\$\{FRAMEWORK_EXCLUDED_DENY_RULES\}"/g, denyValue)
      .replace(/"\$\{FRAMEWORK_AGENT_READ_ALLOW\}"/g, allowValue);

    const parsed = JSON.parse(settingsAfter);
    expect(parsed.permissions.allow).toEqual(allowRules);
    expect(parsed.permissions.deny).toEqual([
      'Read(./node_modules/**)',
      'Read(**/node_modules/**)',
    ]);
    expect(settingsAfter).not.toContain('${FRAMEWORK_AGENT_READ_ALLOW}');
    expect(settingsAfter).not.toContain('${FRAMEWORK_EXCLUDED_DENY_RULES}');
  });
});

describe('FRAMEWORK_AGENT_READ_ALLOW_PLACEHOLDER', () => {
  it('is the exact token settings.json files use', () => {
    expect(FRAMEWORK_AGENT_READ_ALLOW_PLACEHOLDER).toBe('"${FRAMEWORK_AGENT_READ_ALLOW}"');
  });
});

describe('analyzerExcludedDirsOverride', () => {
  let projectPath: string;
  let frameworkPath: string;

  beforeEach(() => {
    projectPath = mkdtempSync(join(tmpdir(), 'analyzer-override-proj-'));
    frameworkPath = mkdtempSync(join(tmpdir(), 'analyzer-override-fw-'));
  });

  afterEach(() => {
    rmSync(projectPath, { recursive: true, force: true });
    rmSync(frameworkPath, { recursive: true, force: true });
  });

  it('removes .claude-temp and .codex-temp from the standard excluded dirs', () => {
    const override = analyzerExcludedDirsOverride(projectPath, frameworkPath);
    expect(override).not.toContain('.claude-temp');
    expect(override).not.toContain('.codex-temp');
  });

  it('keeps every other standard excluded dir intact (node_modules, .git, etc.)', () => {
    const override = analyzerExcludedDirsOverride(projectPath, frameworkPath);
    expect(override).toContain('node_modules');
    expect(override).toContain('.git');
    expect(override).toContain('dist');
    expect(override).toContain('.claude');
    expect(override).toContain('.codex');
  });

  it('produces a deny-rule set that no longer mentions the provider temp dirs', () => {
    const override = analyzerExcludedDirsOverride(projectPath, frameworkPath);
    const rules = buildClaudeDenyRules(projectPath, frameworkPath, override);
    expect(rules.some((r) => r.includes('.claude-temp'))).toBe(false);
    expect(rules.some((r) => r.includes('.codex-temp'))).toBe(false);
    // Sanity: other dirs are still denied.
    expect(rules).toContain('Read(./node_modules/**)');
  });
});
