import { mkdirSync, mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { rmSync } from 'fs';
import { validateSkillAssignments } from '../../../../../../src/nodes/initialize-project/phase5/helpers/skill-assignment-validator.js';
import type {
  AgentSkillAssignments,
  ResolvedSkill,
} from '../../../../../../src/nodes/initialize-project/phase5/types.js';

/**
 * Skill assignment validation.
 *
 * Two non-blocking warnings:
 *   - `skill_cap_exceeded` when an agent has > 8 skills attached.
 *   - `overlapping_skills` when two skills attached to the same
 *     agent share ≥ 60% of their meaningful body tokens (Jaccard).
 *
 * Stack-agnostic: every fixture uses generic skill names ("skill-a",
 * "skill-b") and rule prose that could come from any language family.
 */

let tempDir: string;

afterEach(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

function writeSkill(name: string, body: string): ResolvedSkill {
  if (!tempDir) {
    tempDir = mkdtempSync(join(tmpdir(), 'skill-validator-'));
  }
  const dir = join(tempDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), body, 'utf-8');
  return {
    name,
    path: dir,
    relative_path: name,
    reason: 'test fixture',
    description: `${name} description`,
  };
}

/** Generate a small but meaningfully-distinct body per index. */
function distinctBody(seed: number): string {
  const wordPools = [
    ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota'],
    ['kappa', 'lambda', 'mu', 'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma'],
    ['tau', 'upsilon', 'phi', 'chi', 'psi', 'omega', 'arcadia', 'baltic', 'cosmos'],
    ['delphi', 'eclipse', 'fjord', 'glacier', 'horizon', 'iceberg', 'jungle', 'kismet'],
    ['lyric', 'mosaic', 'nimbus', 'opera', 'palette', 'quasar', 'realm', 'serene'],
    ['titan', 'union', 'vortex', 'whisper', 'xanadu', 'yacht', 'zenith', 'aurora'],
    ['boreal', 'cinder', 'dune', 'echo', 'flora', 'grove', 'haven', 'isle'],
    ['jade', 'krypton', 'loft', 'meadow', 'nest', 'orbit', 'plateau', 'quill'],
    ['rapid', 'summit', 'tundra', 'urchin', 'vista', 'willow', 'xenon', 'yonder'],
  ];
  const pool = wordPools[seed % wordPools.length];
  return `# Skill ${seed}\n${pool.join(' ')}\n`;
}

describe('validateSkillAssignments — skill_cap_exceeded', () => {
  it('does NOT fire when agents have ≤8 skills each', () => {
    const skills: ResolvedSkill[] = Array.from({ length: 8 }, (_, i) =>
      writeSkill(`skill-${i}`, distinctBody(i)),
    );
    const assignments: AgentSkillAssignments = {
      planner: skills,
    };
    expect(validateSkillAssignments(assignments)).toEqual([]);
  });

  it('fires when an agent has 9+ skills', () => {
    const skills: ResolvedSkill[] = Array.from({ length: 9 }, (_, i) =>
      writeSkill(`skill-${i}`, distinctBody(i)),
    );
    const assignments: AgentSkillAssignments = {
      planner: [],
      'implementer-typescript': skills,
    };
    const warnings = validateSkillAssignments(assignments);
    expect(warnings.some((w) => w.code === 'skill_cap_exceeded')).toBe(true);
    const w = warnings.find((w) => w.code === 'skill_cap_exceeded')!;
    expect(w.agent).toBe('implementer-typescript');
    expect(w.message).toContain('9');
  });

  it('respects a custom cap', () => {
    const skills: ResolvedSkill[] = Array.from({ length: 4 }, (_, i) =>
      writeSkill(`skill-${i}`, distinctBody(i)),
    );
    const warnings = validateSkillAssignments({ planner: skills }, { skillCap: 3 });
    expect(warnings.some((w) => w.code === 'skill_cap_exceeded')).toBe(true);
  });
});

describe('validateSkillAssignments — overlapping_skills', () => {
  // Two skills with near-identical body content. The overlap is high
  // because we deliberately reuse the same prescriptive prose.
  const SHARED_BODY = `# Skill
Use camelCase for variables, PascalCase for classes. Always declare types
explicitly. Prefer const over let. Avoid any. Disallow var. Wrap async
callbacks in try-catch. Test boundary conditions. Mock external services.
Avoid mocking the database. Use builders for complex test fixtures.`;

  it('fires when two skills share ≥60% body tokens', () => {
    const a = writeSkill('skill-a', SHARED_BODY);
    // Tweak only a single token — Jaccard should be ~99%.
    const b = writeSkill('skill-b', SHARED_BODY.replace('camelCase', 'snake_case'));
    const warnings = validateSkillAssignments({ planner: [a, b] });
    expect(warnings.some((w) => w.code === 'overlapping_skills')).toBe(true);
    const w = warnings.find((w) => w.code === 'overlapping_skills')!;
    expect(w.agent).toBe('planner');
    expect(w.message).toMatch(/skill-a/);
    expect(w.message).toMatch(/skill-b/);
  });

  it('does NOT fire when skills are unrelated (low Jaccard)', () => {
    const a = writeSkill(
      'lang-ts',
      '# TS\nWrite TypeScript with strict mode. Use const. Disallow any.',
    );
    const b = writeSkill(
      'docker-skill',
      '# Docker\nWrite multi-stage Dockerfiles. Use slim base images. Pin versions.',
    );
    const warnings = validateSkillAssignments({ planner: [a, b] });
    expect(warnings.filter((w) => w.code === 'overlapping_skills')).toEqual([]);
  });

  it('honours a custom overlap threshold', () => {
    const a = writeSkill('skill-a', '# A\nalpha beta gamma delta epsilon zeta eta theta iota');
    // 6/9 tokens overlap; Jaccard = 6/(9+9-6) = 6/12 = 0.5.
    const b = writeSkill('skill-b', '# B\nalpha beta gamma delta epsilon zeta foo bar baz');
    // Default threshold 0.6 → no warn.
    expect(
      validateSkillAssignments({ planner: [a, b] }).filter((w) => w.code === 'overlapping_skills'),
    ).toEqual([]);
    // Lowered to 0.4 → warns.
    expect(
      validateSkillAssignments({ planner: [a, b] }, { overlapThreshold: 0.4 }).some(
        (w) => w.code === 'overlapping_skills',
      ),
    ).toBe(true);
  });

  it('ignores fenced code blocks (only prose drives the comparison)', () => {
    // Both skills share the same code fence but have completely
    // different prose around it. Code is not a signal of overlap;
    // two skills demonstrating the same hello-world fence is fine.
    const code = '```typescript\nconst x = 1;\n```';
    const a = writeSkill(
      'skill-a',
      `# A\nFirst skill prose about authentication patterns and JWT lifecycle handling.\n${code}`,
    );
    const b = writeSkill(
      'skill-b',
      `# B\nSecond skill prose about deployment topology and infrastructure choices.\n${code}`,
    );
    expect(
      validateSkillAssignments({ planner: [a, b] }).filter((w) => w.code === 'overlapping_skills'),
    ).toEqual([]);
  });

  it('ignores YAML frontmatter at the top (only body content drives overlap)', () => {
    // Two skills with different bodies but identical frontmatter
    // boilerplate — must NOT fire.
    const fm = '---\nname: x\ndescription: similar wording in frontmatter only\n---\n';
    const a = writeSkill(
      'skill-a',
      `${fm}# A\nFirst skill body about request lifecycle and routing decisions.`,
    );
    const b = writeSkill(
      'skill-b',
      `${fm}# B\nSecond skill body about queue topology and broker selection.`,
    );
    expect(
      validateSkillAssignments({ planner: [a, b] }).filter((w) => w.code === 'overlapping_skills'),
    ).toEqual([]);
  });

  it('handles missing skill bodies defensively (returns no warning)', () => {
    const a: ResolvedSkill = {
      name: 'skill-a',
      path: '/nonexistent/skill-a',
      relative_path: 'skill-a',
      reason: 'test',
      description: 'test',
    };
    const b: ResolvedSkill = {
      name: 'skill-b',
      path: '/nonexistent/skill-b',
      relative_path: 'skill-b',
      reason: 'test',
      description: 'test',
    };
    expect(validateSkillAssignments({ planner: [a, b] })).toEqual([]);
  });

  it('reports separately per agent (same skills attached to multiple agents → multiple warnings)', () => {
    const a = writeSkill('overlap-a', SHARED_BODY);
    const b = writeSkill('overlap-b', SHARED_BODY.replace('camelCase', 'snake_case'));
    const warnings = validateSkillAssignments({
      planner: [a, b],
      'implementer-typescript': [a, b],
    });
    const overlapWarnings = warnings.filter((w) => w.code === 'overlapping_skills');
    expect(overlapWarnings).toHaveLength(2);
    const agents = new Set(overlapWarnings.map((w) => w.agent));
    expect(agents).toEqual(new Set(['planner', 'implementer-typescript']));
  });
});

describe('validateSkillAssignments — defensive shapes', () => {
  it('returns no warnings on an assignments map with empty agent lists', () => {
    expect(validateSkillAssignments({ planner: [] })).toEqual([]);
  });

  it('returns no warnings when every agent has 0–1 skills', () => {
    const a = writeSkill('skill-a', '# A\nbody');
    expect(
      validateSkillAssignments({
        planner: [a],
        'implementer-generic': [],
      }),
    ).toEqual([]);
  });
});
