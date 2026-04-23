import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { copySkillForProvider } from '../../../../../../src/nodes/initialize-project/phase5/helpers/skill-copier.js';
import { Provider } from '../../../../../../src/providers/types.js';

describe('copySkillForProvider', () => {
  let tmpRoot: string;
  let srcDir: string;
  let destDir: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'skill-copier-'));
    srcDir = join(tmpRoot, 'src');
    destDir = join(tmpRoot, 'dest');
    mkdirSync(srcDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('copies plain SKILL.md with placeholder substitution', () => {
    writeFileSync(join(srcDir, 'SKILL.md'), 'Temp={{TEMP_DIR}} File={{INSTRUCTION_FILE}}');

    const count = copySkillForProvider(srcDir, destDir, Provider.CLAUDE);

    expect(count).toBe(1);
    expect(readFileSync(join(destDir, 'SKILL.md'), 'utf-8')).toBe(
      'Temp=.claude-temp File=CLAUDE.md',
    );
  });

  it('substitutes Codex values when provider is codex', () => {
    writeFileSync(join(srcDir, 'SKILL.md'), 'Temp={{TEMP_DIR}} File={{INSTRUCTION_FILE}}');

    copySkillForProvider(srcDir, destDir, Provider.CODEX);

    expect(readFileSync(join(destDir, 'SKILL.md'), 'utf-8')).toBe(
      'Temp=.codex-temp File=AGENTS.md',
    );
  });

  it('selects SKILL.claude.md for claude and skips the codex variant', () => {
    writeFileSync(join(srcDir, 'SKILL.claude.md'), 'Claude body {{TEMP_DIR}}');
    writeFileSync(join(srcDir, 'SKILL.codex.md'), 'Codex body {{TEMP_DIR}}');

    copySkillForProvider(srcDir, destDir, Provider.CLAUDE);

    expect(readFileSync(join(destDir, 'SKILL.md'), 'utf-8')).toBe('Claude body .claude-temp');
    expect(existsSync(join(destDir, 'SKILL.claude.md'))).toBe(false);
    expect(existsSync(join(destDir, 'SKILL.codex.md'))).toBe(false);
  });

  it('selects SKILL.codex.md for codex and skips the claude variant', () => {
    writeFileSync(join(srcDir, 'SKILL.claude.md'), 'Claude body');
    writeFileSync(join(srcDir, 'SKILL.codex.md'), 'Codex body {{TEMP_DIR}}');

    copySkillForProvider(srcDir, destDir, Provider.CODEX);

    expect(readFileSync(join(destDir, 'SKILL.md'), 'utf-8')).toBe('Codex body .codex-temp');
    expect(existsSync(join(destDir, 'SKILL.claude.md'))).toBe(false);
    expect(existsSync(join(destDir, 'SKILL.codex.md'))).toBe(false);
  });

  it('throws when both SKILL.md and SKILL.<provider>.md exist (ambiguous source)', () => {
    writeFileSync(join(srcDir, 'SKILL.md'), 'plain');
    writeFileSync(join(srcDir, 'SKILL.claude.md'), 'claude variant');

    expect(() => copySkillForProvider(srcDir, destDir, Provider.CLAUDE)).toThrow(
      /Ambiguous skill source/,
    );
  });

  it('returns 0 when the source directory does not exist', () => {
    expect(copySkillForProvider(join(tmpRoot, 'missing'), destDir, Provider.CLAUDE)).toBe(0);
  });

  it('returns 0 when the requested provider has no matching variant', () => {
    writeFileSync(join(srcDir, 'SKILL.claude.md'), 'claude only');

    const count = copySkillForProvider(srcDir, destDir, Provider.CODEX);

    expect(count).toBe(0);
    expect(existsSync(join(destDir, 'SKILL.md'))).toBe(false);
  });

  it('recursively copies subdirectories and non-md assets verbatim', () => {
    writeFileSync(join(srcDir, 'SKILL.md'), '# root');
    const sub = join(srcDir, 'assets');
    mkdirSync(sub);
    writeFileSync(join(sub, 'helper.sh'), '#!/bin/bash\necho hi');
    writeFileSync(join(sub, 'notes.md'), 'uses {{TEMP_DIR}}');

    copySkillForProvider(srcDir, destDir, Provider.CLAUDE);

    expect(readFileSync(join(destDir, 'SKILL.md'), 'utf-8')).toBe('# root');
    expect(readFileSync(join(destDir, 'assets', 'helper.sh'), 'utf-8')).toBe(
      '#!/bin/bash\necho hi',
    );
    expect(readFileSync(join(destDir, 'assets', 'notes.md'), 'utf-8')).toBe('uses .claude-temp');
  });

  it('throws when a skill contains an unknown placeholder', () => {
    writeFileSync(join(srcDir, 'SKILL.md'), 'bad {{UNKNOWN}} token');

    expect(() => copySkillForProvider(srcDir, destDir, Provider.CLAUDE)).toThrow(
      /Unknown placeholder/,
    );
  });
});
