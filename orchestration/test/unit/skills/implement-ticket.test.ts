import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect, beforeAll } from 'vitest';

const SKILL_CLAUDE_PATH = join(
  __dirname,
  '../../../../skills/020-development-workflow/implement-ticket/SKILL.claude.md',
);

const SKILL_CODEX_PATH = join(
  __dirname,
  '../../../../skills/020-development-workflow/implement-ticket/SKILL.codex.md',
);

function extractTaskListSection(content: string): string {
  const start = content.indexOf('Create each task using TaskCreate with these exact values:');
  const end = content.indexOf('After creating all');
  if (start === -1 || end === -1) return '';
  return content.slice(start, end);
}

function extractDependencyChainBlock(content: string): string {
  const marker = 'After creating all';
  const start = content.indexOf(marker);
  const end = content.indexOf('### Task Status Rules');
  if (start === -1 || end === -1) return '';
  return content.slice(start, end);
}

function extractPhase0Section(content: string): string {
  const start = content.indexOf('### Phase 0: Preflight Validation');
  const end = content.indexOf('CONTINUE WITH Phase 1');
  if (start === -1) return '';
  if (end === -1) {
    // Codex variant uses Expected outputs / Constraint pattern instead
    const endAlt = content.indexOf('### Phase 1:', start);
    return endAlt === -1 ? '' : content.slice(start, endAlt);
  }
  return content.slice(start, end);
}

function extractPhase85Section(content: string): string {
  const start = content.indexOf('### Phase 8.5: Wiki Refresh');
  if (start === -1) return '';
  const end = content.indexOf('### Phase 9:', start);
  return end === -1 ? '' : content.slice(start, end);
}

function extractPhase9Section(content: string): string {
  const start = content.indexOf('### Phase 9: PR Creation');
  if (start === -1) return '';
  const end = content.indexOf('### Phase 10:', start);
  return end === -1 ? '' : content.slice(start, end);
}

describe('SKILL.claude.md — Phase F regression', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(SKILL_CLAUDE_PATH, 'utf-8');
  });

  describe('Phase 8.5 existence', () => {
    it('contains ### Phase 8.5: Wiki Refresh section', () => {
      expect(content).toContain('### Phase 8.5: Wiki Refresh');
    });

    it('Phase 8.5 appears between Phase 8 and Phase 9', () => {
      const phase8Idx = content.indexOf('### Phase 8: Documentation Update');
      const phase85Idx = content.indexOf('### Phase 8.5: Wiki Refresh');
      const phase9Idx = content.indexOf('### Phase 9: PR Creation');

      expect(phase8Idx).toBeGreaterThanOrEqual(0);
      expect(phase85Idx).toBeGreaterThan(phase8Idx);
      expect(phase9Idx).toBeGreaterThan(phase85Idx);
    });

    it('Phase 8.5 instructs computing branch-base via git merge-base', () => {
      const section = extractPhase85Section(content);
      expect(section).toContain('git merge-base HEAD origin/development');
    });

    it('Phase 8.5 instructs invoking /wiki-refresh with --since flag', () => {
      const section = extractPhase85Section(content);
      expect(section).toContain('/wiki-refresh');
      expect(section).toContain('--since <branch-base>');
    });

    it('Phase 8.5 STOPs on structural lint violations', () => {
      const section = extractPhase85Section(content);
      expect(section).toContain('structural lint violations');
      expect(section).toContain('STOP');
    });

    it('Phase 8.5 stages only docs/llm-wiki/** paths in the commit', () => {
      const section = extractPhase85Section(content);
      expect(section).toContain('docs/llm-wiki/**');
    });

    it('Phase 8.5 uses Conventional Commit message format', () => {
      const section = extractPhase85Section(content);
      expect(section).toContain('docs(wiki): refresh for <TICKET-ID>');
    });

    it('Phase 8.5 is optional when no pages changed', () => {
      const section = extractPhase85Section(content);
      expect(section).toContain('no pages in the refresh set');
    });
  });

  describe('task list has 13 tasks', () => {
    it('task tracking setup mentions 13 tasks', () => {
      expect(content).toContain('Create all 13 tasks first');
    });

    it('task list contains task numbered 10 as Phase 8.5', () => {
      const taskList = extractTaskListSection(content);
      expect(taskList).toContain('10. Phase 8.5: Wiki Refresh');
    });

    it('task list contains task numbered 11 as Phase 9', () => {
      const taskList = extractTaskListSection(content);
      expect(taskList).toContain('11. Phase 9: PR Creation');
    });

    it('task list contains task numbered 12 as Phase 10', () => {
      const taskList = extractTaskListSection(content);
      expect(taskList).toContain('12. Phase 10: Review Loop');
    });

    it('task list contains task numbered 13 as Phase 11', () => {
      const taskList = extractTaskListSection(content);
      expect(taskList).toContain('13. Phase 11: Cleanup');
    });

    it('dependency chain references After creating all 13 tasks', () => {
      const block = extractDependencyChainBlock(content);
      expect(block).toContain('After creating all 13 tasks');
    });
  });

  describe('dependency chain is correct', () => {
    it('Task 10 addBlockedBy [Task 9]', () => {
      const block = extractDependencyChainBlock(content);
      expect(block).toContain('Task 10 addBlockedBy [Task 9]');
    });

    it('Task 11 addBlockedBy [Task 10]', () => {
      const block = extractDependencyChainBlock(content);
      expect(block).toContain('Task 11 addBlockedBy [Task 10]');
    });

    it('Task 12 addBlockedBy [Task 11]', () => {
      const block = extractDependencyChainBlock(content);
      expect(block).toContain('Task 12 addBlockedBy [Task 11]');
    });

    it('Task 13 addBlockedBy [Task 12]', () => {
      const block = extractDependencyChainBlock(content);
      expect(block).toContain('Task 13 addBlockedBy [Task 12]');
    });
  });

  describe('Phase 0 preflight — staleness WARN not FAIL', () => {
    it('Phase 0 checks graph_commit key', () => {
      const section = extractPhase0Section(content);
      expect(section).toContain('graph_commit');
    });

    it('Phase 0 WARNs on graph_version mismatch', () => {
      const section = extractPhase0Section(content);
      expect(section).toContain('WARN');
    });

    it('Phase 0 does not STOP on staleness alone', () => {
      const section = extractPhase0Section(content);
      expect(section).toContain('Do not block the workflow on stale wiki');
    });

    it('Phase 0 CRITICAL block explicitly excludes staleness from failures', () => {
      expect(content).toContain(
        'Staleness warnings (graph_version or graph_commit mismatch) do NOT count as failures',
      );
    });

    it('Phase 0 references Phase 8.5 as the self-healing mechanism', () => {
      const section = extractPhase0Section(content);
      expect(section).toContain('Phase 8.5');
    });
  });

  describe('Phase 9 has Phase 8.5 prerequisite', () => {
    it('Phase 9 section confirms Phase 8.5 completion before proceeding', () => {
      const section = extractPhase9Section(content);
      expect(section).toContain('Phase 8.5 marked completed');
    });

    it('Phase 9 STOPs if structural lint failures from 8.5 are unresolved', () => {
      const section = extractPhase9Section(content);
      expect(section).toContain('structural lint failures from 8.5');
      expect(section).toContain('STOP');
    });
  });

  describe('CRITICAL block mentions Phase 8.5 self-healing', () => {
    it('Graph-Aware CRITICAL block mentions Phase 8.5 Wiki Refresh', () => {
      const criticalBlock = content.slice(
        content.indexOf('## CRITICAL: Graph-Aware and Wiki-Aware Requirements'),
        content.indexOf('## CRITICAL: Artifact Path Enforcement'),
      );
      expect(criticalBlock).toContain('Phase 8.5 (Wiki Refresh)');
    });

    it('CRITICAL block states refresh fixes staleness', () => {
      const criticalBlock = content.slice(
        content.indexOf('## CRITICAL: Graph-Aware and Wiki-Aware Requirements'),
        content.indexOf('## CRITICAL: Artifact Path Enforcement'),
      );
      expect(criticalBlock).toContain(
        'if the preflight warns about staleness, the refresh will fix it',
      );
    });
  });

  describe('Skills and Agents Used lists /wiki-refresh', () => {
    it('Skills section includes /wiki-refresh at Phase 8.5', () => {
      const skillsSection = content.slice(
        content.indexOf('## Skills and Agents Used'),
        content.indexOf('## Prerequisites'),
      );
      expect(skillsSection).toContain('/wiki-refresh');
      expect(skillsSection).toContain('Phase 8.5');
    });
  });
});

describe('SKILL.codex.md — Phase F regression (symmetric)', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(SKILL_CODEX_PATH, 'utf-8');
  });

  describe('Phase 8.5 existence', () => {
    it('contains ### Phase 8.5: Wiki Refresh section', () => {
      expect(content).toContain('### Phase 8.5: Wiki Refresh');
    });

    it('Phase 8.5 appears between Phase 8 and Phase 9', () => {
      const phase8Idx = content.indexOf('### Phase 8: Documentation Update');
      const phase85Idx = content.indexOf('### Phase 8.5: Wiki Refresh');
      const phase9Idx = content.indexOf('### Phase 9: PR Creation');

      expect(phase8Idx).toBeGreaterThanOrEqual(0);
      expect(phase85Idx).toBeGreaterThan(phase8Idx);
      expect(phase9Idx).toBeGreaterThan(phase85Idx);
    });

    it('Phase 8.5 instructs computing branch-base via git merge-base', () => {
      const section = extractPhase85Section(content);
      expect(section).toContain('git merge-base HEAD origin/development');
    });

    it('Phase 8.5 instructs invoking /wiki-refresh with --since flag', () => {
      const section = extractPhase85Section(content);
      expect(section).toContain('/wiki-refresh');
      expect(section).toContain('--since <branch-base>');
    });

    it('Phase 8.5 STOPs on structural lint violations', () => {
      const section = extractPhase85Section(content);
      expect(section).toContain('structural lint violations');
      expect(section).toContain('STOP');
    });

    it('Phase 8.5 stages only docs/llm-wiki/** paths in the commit', () => {
      const section = extractPhase85Section(content);
      expect(section).toContain('docs/llm-wiki/**');
    });

    it('Phase 8.5 uses Conventional Commit message format', () => {
      const section = extractPhase85Section(content);
      expect(section).toContain('docs(wiki): refresh for <TICKET-ID>');
    });
  });

  describe('Phase 0 preflight — staleness WARN not FAIL', () => {
    it('Phase 0 checks graph_commit key', () => {
      const section = extractPhase0Section(content);
      expect(section).toContain('graph_commit');
    });

    it('Phase 0 WARNs on graph_version mismatch', () => {
      const section = extractPhase0Section(content);
      expect(section).toContain('WARN');
    });

    it('Phase 0 does not STOP on staleness alone', () => {
      const section = extractPhase0Section(content);
      expect(section).toContain('Do not block the workflow on stale wiki');
    });

    it('Phase 0 CRITICAL/Constraint explicitly excludes staleness from failures', () => {
      expect(content).toContain(
        'Staleness warnings (graph_version or graph_commit mismatch) do NOT count as failures',
      );
    });

    it('Phase 0 references Phase 8.5 as the self-healing mechanism', () => {
      const section = extractPhase0Section(content);
      expect(section).toContain('Phase 8.5');
    });
  });

  describe('Phase 9 has Phase 8.5 prerequisite', () => {
    it('Phase 9 section confirms Phase 8.5 completion before proceeding', () => {
      const section = extractPhase9Section(content);
      expect(section).toContain('Phase 8.5 marked completed');
    });

    it('Phase 9 emits failed and STOPs if structural lint failures from 8.5 are unresolved', () => {
      const section = extractPhase9Section(content);
      expect(section).toContain('structural lint failures from 8.5');
    });
  });

  describe('CRITICAL block mentions Phase 8.5 self-healing', () => {
    it('Graph-Aware CRITICAL block mentions Phase 8.5 Wiki Refresh', () => {
      const criticalBlock = content.slice(
        content.indexOf('## CRITICAL: Graph-Aware and Wiki-Aware Requirements'),
        content.indexOf('## CRITICAL: Artifact Path Enforcement'),
      );
      expect(criticalBlock).toContain('Phase 8.5 (Wiki Refresh)');
    });
  });

  describe('Codex-specific: uses AGENTS.md not CLAUDE.md', () => {
    it('references AGENTS.md as the provider schema doc', () => {
      expect(content).toContain('docs/llm-wiki/AGENTS.md');
    });

    it('does not reference docs/llm-wiki/CLAUDE.md', () => {
      expect(content).not.toContain('docs/llm-wiki/CLAUDE.md');
    });
  });

  describe('Skills and Role Prompts Used lists /wiki-refresh', () => {
    it('Skills section includes /wiki-refresh at Phase 8.5', () => {
      const skillsSection = content.slice(
        content.indexOf('## Skills and Role Prompts Used'),
        content.indexOf('## Prerequisites'),
      );
      expect(skillsSection).toContain('/wiki-refresh');
      expect(skillsSection).toContain('Phase 8.5');
    });
  });
});
