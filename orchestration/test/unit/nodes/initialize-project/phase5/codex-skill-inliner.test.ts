import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  dedupeAgainstSeen,
  inlineSkillBodiesForCodex,
  makeCodexSkillPathResolver,
} from '../../../../../src/nodes/initialize-project/phase5/helpers/codex-skill-inliner.js';
import type { ResolvedSkill } from '../../../../../src/nodes/initialize-project/phase5/types.js';

/**
 * Codex skill-body inliner tests.
 *
 * Why this matters: Claude Code subagents auto-load every skill listed in
 * `skills:` frontmatter at spawn (full body). Codex CLI does NOT — the
 * framework strips `skills:` at spawn. This inliner is the bridge that
 * embeds each assigned skill's body into the agent file at build time so
 * Codex agents see the same prescriptive context Claude agents do.
 *
 * Stack-agnostic: the helper operates on a list of resolved skills and an
 * on-disk path resolver — no language-specific or framework-specific
 * assumptions.
 */

function makeSkill(name: string): ResolvedSkill {
  return {
    name,
    path: '',
    relative_path: name,
    reason: 'test',
    description: '',
  };
}

describe('inlineSkillBodiesForCodex', () => {
  let tempDir: string;
  let skillsRoot: string;
  let resolveSkillPath: (skillName: string) => string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'codex-skill-inliner-'));
    skillsRoot = '.codex/skills';
    resolveSkillPath = makeCodexSkillPathResolver(tempDir, skillsRoot);
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function writeSkill(name: string, body: string): void {
    const dir = join(tempDir, skillsRoot, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'SKILL.md'), body, 'utf-8');
  }

  function buildAgent(): string {
    return [
      '---',
      'name: planner',
      'model: opus',
      'skills: [code-conventions, multi-file-workflows]',
      '---',
      '',
      '# Planner',
      '',
      'Body content goes here.',
    ].join('\n');
  }

  it('returns input unchanged when no skills are assigned', () => {
    const agent = buildAgent();
    const out = inlineSkillBodiesForCodex(agent, {
      projectPath: tempDir,
      skills: [],
      resolveSkillPath,
    });
    expect(out).toBe(agent);
  });

  it('returns input unchanged when input has no frontmatter', () => {
    const noFrontmatter = '# Just a body\n\nNo frontmatter here.';
    const out = inlineSkillBodiesForCodex(noFrontmatter, {
      projectPath: tempDir,
      skills: [makeSkill('code-conventions')],
      resolveSkillPath,
    });
    expect(out).toBe(noFrontmatter);
  });

  it('inlines a skill body wrapped in <skill name="..."> tags after the frontmatter', () => {
    writeSkill(
      'code-conventions',
      '---\nname: code-conventions\n---\n\n# Code Conventions\n\nRule one.',
    );

    const out = inlineSkillBodiesForCodex(buildAgent(), {
      projectPath: tempDir,
      skills: [makeSkill('code-conventions')],
      resolveSkillPath,
    });

    expect(out).toContain('<!-- CODEX_SKILL_INLINE_START -->');
    expect(out).toContain('<!-- CODEX_SKILL_INLINE_END -->');
    expect(out).toContain('<skill name="code-conventions">');
    expect(out).toContain('# Code Conventions');
    expect(out).toContain('Rule one.');
    expect(out).toContain('</skill>');
  });

  it('strips frontmatter from the inlined skill body', () => {
    writeSkill(
      'code-conventions',
      '---\nname: code-conventions\ndescription: Project rules\n---\n\n# Body\n\nA rule.',
    );

    const out = inlineSkillBodiesForCodex(buildAgent(), {
      projectPath: tempDir,
      skills: [makeSkill('code-conventions')],
      resolveSkillPath,
    });

    // The wrapping tag carries the name; the YAML metadata is stripped.
    expect(out).not.toMatch(/description:\s*Project rules/);
    expect(out).toContain('# Body');
    expect(out).toContain('A rule.');
  });

  it('places the inline block AFTER the frontmatter and BEFORE the body', () => {
    writeSkill('code-conventions', '---\nname: code-conventions\n---\n\nrule body');

    const agent = buildAgent();
    const out = inlineSkillBodiesForCodex(agent, {
      projectPath: tempDir,
      skills: [makeSkill('code-conventions')],
      resolveSkillPath,
    });

    const frontmatterEnd = out.indexOf('---', 4) + 3; // position after closing `---`
    const inlineStart = out.indexOf('<!-- CODEX_SKILL_INLINE_START -->');
    const bodyStart = out.indexOf('# Planner');

    expect(inlineStart).toBeGreaterThan(frontmatterEnd);
    expect(inlineStart).toBeLessThan(bodyStart);
  });

  it('inlines multiple skill bodies in order', () => {
    writeSkill('code-conventions', '---\nname: code-conventions\n---\n\nFirst rule.');
    writeSkill('multi-file-workflows', '---\nname: multi-file-workflows\n---\n\nSecond checklist.');
    writeSkill('testing-conventions', '---\nname: testing-conventions\n---\n\nThird test rule.');

    const out = inlineSkillBodiesForCodex(buildAgent(), {
      projectPath: tempDir,
      skills: [
        makeSkill('code-conventions'),
        makeSkill('multi-file-workflows'),
        makeSkill('testing-conventions'),
      ],
      resolveSkillPath,
    });

    const firstIdx = out.indexOf('First rule.');
    const secondIdx = out.indexOf('Second checklist.');
    const thirdIdx = out.indexOf('Third test rule.');

    expect(firstIdx).toBeGreaterThan(0);
    expect(secondIdx).toBeGreaterThan(firstIdx);
    expect(thirdIdx).toBeGreaterThan(secondIdx);
  });

  it('skips skills whose body is missing on disk (silent build step, not a hard validation)', () => {
    writeSkill('code-conventions', '---\nname: code-conventions\n---\n\nRule one.');
    // intentionally do NOT write multi-file-workflows

    const out = inlineSkillBodiesForCodex(buildAgent(), {
      projectPath: tempDir,
      skills: [makeSkill('code-conventions'), makeSkill('multi-file-workflows')],
      resolveSkillPath,
    });

    expect(out).toContain('<skill name="code-conventions">');
    expect(out).not.toContain('<skill name="multi-file-workflows">');
  });

  it('emits no inline block when none of the assigned skills resolve on disk', () => {
    // No skills written.
    const agent = buildAgent();
    const out = inlineSkillBodiesForCodex(agent, {
      projectPath: tempDir,
      skills: [makeSkill('code-conventions'), makeSkill('multi-file-workflows')],
      resolveSkillPath,
    });
    // The function still strips any prior block on idempotent re-runs, but
    // since none was present and none could be added, the input is unchanged.
    expect(out).toBe(agent);
  });

  it('replaces a prior inline block on idempotent re-runs (no duplication)', () => {
    writeSkill('code-conventions', '---\nname: code-conventions\n---\n\nFirst version.');

    const firstPass = inlineSkillBodiesForCodex(buildAgent(), {
      projectPath: tempDir,
      skills: [makeSkill('code-conventions')],
      resolveSkillPath,
    });
    expect(firstPass).toContain('First version.');

    // Update the skill body and re-run with the SAME first-pass output as input.
    writeSkill('code-conventions', '---\nname: code-conventions\n---\n\nSecond version.');
    const secondPass = inlineSkillBodiesForCodex(firstPass, {
      projectPath: tempDir,
      skills: [makeSkill('code-conventions')],
      resolveSkillPath,
    });

    expect(secondPass).toContain('Second version.');
    expect(secondPass).not.toContain('First version.');
    // Exactly one block, not two.
    const blockCount = (secondPass.match(/CODEX_SKILL_INLINE_START/g) ?? []).length;
    expect(blockCount).toBe(1);
  });

  it('handles a malformed-frontmatter skill body by emitting the raw body', () => {
    // Missing closing `---` — gray-matter throws on parse; the inliner
    // should fall back to the raw body and not crash.
    writeSkill(
      'malformed-skill',
      '---\nname: malformed-skill\nno closing fence\n# body without frontmatter close\nbody text',
    );

    const out = inlineSkillBodiesForCodex(buildAgent(), {
      projectPath: tempDir,
      skills: [makeSkill('malformed-skill')],
      resolveSkillPath,
    });

    expect(out).toContain('<skill name="malformed-skill">');
    expect(out).toContain('body text');
  });

  describe('paragraph dedup (Wave 3 §I.3)', () => {
    // Two skills sharing a 200+-byte paragraph should ship that
    // paragraph once and emit a `<see-skill name="..."/>` cross-ref
    // in subsequent skills. Stack-agnostic: paragraph comparison only.

    const SHARED_PARA = `When implementing a new feature, ALWAYS write the test alongside the implementation. Tests live in the same package as the code they exercise; mirror the source file path under \`__tests__/\` or \`*.spec\` per the project's testing conventions skill. Do not commit code without an accompanying test that covers at least the happy path and one error path. Mocks are only acceptable for true external boundaries (network, filesystem); never mock the database or the framework under test.`;

    it('does NOT dedupe when paragraphs differ', () => {
      writeSkill('skill-a', `# Skill A\n\nUnique paragraph for skill A. About auth flow.`);
      writeSkill('skill-b', `# Skill B\n\nDifferent paragraph for skill B. About queue topology.`);
      const out = inlineSkillBodiesForCodex(buildAgent(), {
        projectPath: tempDir,
        skills: [makeSkill('skill-a'), makeSkill('skill-b')],
        resolveSkillPath,
      });
      expect(out).toContain('Unique paragraph for skill A');
      expect(out).toContain('Different paragraph for skill B');
      expect(out).not.toContain('<see-skill');
    });

    it('replaces a duplicated 200+-byte paragraph with a cross-ref', () => {
      writeSkill('skill-a', `# Skill A\n\n${SHARED_PARA}\n\nSkill A unique tail.`);
      writeSkill('skill-b', `# Skill B\n\n${SHARED_PARA}\n\nSkill B unique tail.`);
      const out = inlineSkillBodiesForCodex(buildAgent(), {
        projectPath: tempDir,
        skills: [makeSkill('skill-a'), makeSkill('skill-b')],
        resolveSkillPath,
      });
      // Skill A keeps the full paragraph; skill B carries a cross-ref.
      expect(out).toContain(SHARED_PARA);
      expect(out).toContain('<see-skill name="skill-a"/>');
      // Skill B unique tail is preserved.
      expect(out).toContain('Skill B unique tail.');
      // The shared paragraph appears exactly once in the output.
      const occurrences = out.split(SHARED_PARA).length - 1;
      expect(occurrences).toBe(1);
    });

    it('does NOT dedupe paragraphs shorter than the 200-byte threshold', () => {
      // A short paragraph repeated across two skills is left in place —
      // the cross-ref tag itself takes ~30 bytes, so deduping a short
      // paragraph saves nothing.
      const short = 'Use camelCase for variables.';
      writeSkill('skill-a', `# A\n\n${short}\n\nA tail.`);
      writeSkill('skill-b', `# B\n\n${short}\n\nB tail.`);
      const out = inlineSkillBodiesForCodex(buildAgent(), {
        projectPath: tempDir,
        skills: [makeSkill('skill-a'), makeSkill('skill-b')],
        resolveSkillPath,
      });
      const occurrences = out.split(short).length - 1;
      expect(occurrences).toBe(2);
      expect(out).not.toContain('<see-skill');
    });
  });
});

describe('dedupeAgainstSeen — pure function', () => {
  it('returns the body unchanged on the first skill', () => {
    const seen = new Map<string, string>();
    const body = 'A'.repeat(300);
    expect(dedupeAgainstSeen('skill-a', body, seen)).toBe(body);
    expect(seen.get(body)).toBe('skill-a');
  });

  it('cross-refs an exact-match paragraph that already appeared', () => {
    const seen = new Map<string, string>();
    const longPara = 'A'.repeat(300);
    dedupeAgainstSeen('skill-a', longPara, seen);
    const out = dedupeAgainstSeen('skill-b', longPara, seen);
    expect(out).toContain('<see-skill name="skill-a"/>');
  });

  it('preserves code fences as a single unit (does not split or dedupe)', () => {
    // Even if a code fence appeared in an earlier skill, a fence is
    // never deduped — it's a code example, not prose.
    const seen = new Map<string, string>();
    const fence = ['```typescript', 'export const x = 1;', '```'].join('\n');
    dedupeAgainstSeen('skill-a', `prose\n\n${fence}`, seen);
    const out = dedupeAgainstSeen('skill-b', `prose\n\n${fence}`, seen);
    expect(out).toContain('export const x = 1;');
  });

  it('handles a body composed of only short paragraphs (returns unchanged)', () => {
    const seen = new Map<string, string>();
    const body = 'Short.\n\nAnother short paragraph.';
    dedupeAgainstSeen('skill-a', body, seen);
    const out = dedupeAgainstSeen('skill-b', body, seen);
    expect(out).not.toContain('<see-skill');
  });
});
