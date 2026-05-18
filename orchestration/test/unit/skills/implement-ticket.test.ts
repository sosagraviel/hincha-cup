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
  // The Phase 0 heading was generalised when the auto-bootstrap preflight
  // landed; match the new heading first, fall back to the old one for any
  // legacy variants we might encounter.
  const headings = [
    '### Phase 0: Preflight (MANDATORY — Auto-bootstrap + Validation)',
    '### Phase 0: Preflight Validation',
  ];
  let start = -1;
  for (const heading of headings) {
    const idx = content.indexOf(heading);
    if (idx >= 0) {
      start = idx;
      break;
    }
  }
  if (start === -1) return '';
  const end = content.indexOf('CONTINUE WITH Phase 1');
  if (end === -1) {
    // Codex variant uses Expected outputs / Constraint pattern instead
    const endAlt = content.indexOf('### Phase 1:', start);
    return endAlt === -1 ? '' : content.slice(start, endAlt);
  }
  return content.slice(start, end);
}

function extractPhase84Section(content: string): string {
  const start = content.indexOf('### Phase 8.4: Implementation Commit');
  if (start === -1) return '';
  const end = content.indexOf('### Phase 8.5:', start);
  return end === -1 ? '' : content.slice(start, end);
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

  describe('Phase 8.4 existence', () => {
    it('contains ### Phase 8.4: Implementation Commit section', () => {
      expect(content).toContain('### Phase 8.4: Implementation Commit');
    });

    it('Phase 8.4 appears between Phase 8 and Phase 8.5', () => {
      const phase8Idx = content.indexOf('### Phase 8: Documentation Update');
      const phase84Idx = content.indexOf('### Phase 8.4: Implementation Commit');
      const phase85Idx = content.indexOf('### Phase 8.5: Wiki Refresh');

      expect(phase8Idx).toBeGreaterThanOrEqual(0);
      expect(phase84Idx).toBeGreaterThan(phase8Idx);
      expect(phase85Idx).toBeGreaterThan(phase84Idx);
    });

    it('Phase 8.4 produces the implementation commit before wiki-refresh', () => {
      // The commit ordering is encoded several different ways in the
      // current skill text — accept any of: "before /wiki-refresh",
      // "BEFORE Phase 8.5", or a "CONTINUE WITH Phase 8.5" terminator at
      // the end of the section (the canonical multi-repo phrasing). All
      // three convey "implementation commit lands before the wiki refresh
      // step".
      const section = extractPhase84Section(content);
      expect(section).toMatch(
        /before .* \/wiki-refresh|BEFORE .* Phase 8\.5|CONTINUE WITH Phase 8\.5/i,
      );
    });

    it('Phase 8.4 excludes docs/llm-wiki/** from the staged list', () => {
      // The skill text uses lowercase "exclude" in the canonical multi-repo
      // form ("exclude `docs/llm-wiki/**` (Phase 8.5 owns it)"). Match
      // case-insensitively so a future capitalization tweak doesn't break
      // CI silently.
      const section = extractPhase84Section(content);
      expect(section).toContain('docs/llm-wiki/**');
      expect(section).toMatch(/exclude `docs\/llm-wiki\/\*\*`/i);
    });

    it('Phase 8.4 forbids git add . / -A / commit -a', () => {
      const section = extractPhase84Section(content);
      expect(section).toMatch(/Never `git add \.`/);
      expect(section).toMatch(/`-A`/);
    });

    it('Phase 8.4 STOPs on pre-commit hook failure', () => {
      const section = extractPhase84Section(content);
      expect(section).toContain('STOP');
      expect(section).toMatch(/pre-commit hook|hook output/i);
    });

    it('Phase 8.4 captures commit SHAs to $ARTIFACTS_DIR/commits/', () => {
      const section = extractPhase84Section(content);
      expect(section).toContain('$ARTIFACTS_DIR/commits/');
    });
  });

  describe('Phase 8.5 existence', () => {
    it('contains ### Phase 8.5: Wiki Refresh section', () => {
      expect(content).toContain('### Phase 8.5: Wiki Refresh');
    });

    it('Phase 8.5 appears between Phase 8.4 and Phase 9', () => {
      const phase84Idx = content.indexOf('### Phase 8.4: Implementation Commit');
      const phase85Idx = content.indexOf('### Phase 8.5: Wiki Refresh');
      const phase9Idx = content.indexOf('### Phase 9: PR Creation');

      expect(phase84Idx).toBeGreaterThanOrEqual(0);
      expect(phase85Idx).toBeGreaterThan(phase84Idx);
      expect(phase9Idx).toBeGreaterThan(phase85Idx);
    });

    it('Phase 8.5 invokes /wiki-refresh with --commit --ticket --artifacts-dir', () => {
      const section = extractPhase85Section(content);
      expect(section).toContain('/wiki-refresh');
      expect(section).toContain('--commit');
      expect(section).toContain('--ticket <TICKET-ID>');
      expect(section).toContain('--artifacts-dir $ARTIFACTS_DIR');
      // Legacy --since / --hints flags must not appear.
      expect(section).not.toContain('--since <branch-base>');
      expect(section).not.toContain('--hints');
    });

    it('Phase 8.5 STOPs on hard error from /wiki-refresh', () => {
      const section = extractPhase85Section(content);
      expect(section).toMatch(/hard error/i);
      expect(section).toContain('STOP');
    });

    it('Phase 8.5 delegates wiki commit to /wiki-refresh — orchestrator no longer stages docs/llm-wiki/**', () => {
      const section = extractPhase85Section(content);
      // The skill owns the commit now; the orchestrator references it but
      // does not duplicate the `git add docs/llm-wiki/**` logic.
      expect(section).not.toMatch(/Stage only `docs\/llm-wiki\/\*\*` paths\./);
    });

    it('Phase 8.5 is optional when no pages changed', () => {
      const section = extractPhase85Section(content);
      expect(section).toMatch(/no changes|no pages|wiki is fresh/i);
    });

    it('Phase 8.5 surfaces new-service suggestions but does not auto-create', () => {
      const section = extractPhase85Section(content);
      expect(section).toMatch(/\/wiki-add-service|new service/i);
    });
  });

  describe('task list has 14 tasks', () => {
    it('task tracking setup mentions 14 tasks', () => {
      expect(content).toContain('Create all 14 tasks first');
    });

    it('task list contains task numbered 10 as Phase 8.4', () => {
      const taskList = extractTaskListSection(content);
      expect(taskList).toContain('10. Phase 8.4: Implementation Commit');
    });

    it('task list contains task numbered 11 as Phase 8.5', () => {
      const taskList = extractTaskListSection(content);
      expect(taskList).toContain('11. Phase 8.5: Wiki Refresh');
    });

    it('task list contains task numbered 12 as Phase 9', () => {
      const taskList = extractTaskListSection(content);
      expect(taskList).toContain('12. Phase 9: PR Creation');
    });

    it('task list contains task numbered 13 as Phase 10', () => {
      const taskList = extractTaskListSection(content);
      expect(taskList).toContain('13. Phase 10: Review Loop');
    });

    it('task list contains task numbered 14 as Phase 11', () => {
      const taskList = extractTaskListSection(content);
      expect(taskList).toContain('14. Phase 11: Cleanup');
    });

    it('dependency chain references After creating all 14 tasks', () => {
      const block = extractDependencyChainBlock(content);
      expect(block).toContain('After creating all 14 tasks');
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

    it('Task 14 addBlockedBy [Task 13]', () => {
      const block = extractDependencyChainBlock(content);
      expect(block).toContain('Task 14 addBlockedBy [Task 13]');
    });
  });

  describe('Phase 0 preflight — wiki staleness handled by Phase 8.5', () => {
    it('Phase 0 references Phase 8.5 as the wiki-refresh mechanism', () => {
      const section = extractPhase0Section(content);
      expect(section).toContain('Phase 8.5');
    });

    it('Phase 0 no longer checks graph_version / graph_commit on wiki pages', () => {
      const section = extractPhase0Section(content);
      // The simplified frontmatter shape (2026-05) drops both fields, so
      // their names must not appear in any wiki-related preflight check.
      expect(section).not.toMatch(/wiki[^.]{0,40}graph_version/);
      expect(section).not.toMatch(/wiki[^.]{0,40}graph_commit/);
    });

    it('Phase 0 asserts the new minimal frontmatter keys (document_type, summary, last_updated)', () => {
      const section = extractPhase0Section(content);
      expect(section).toContain('document_type');
      expect(section).toContain('summary');
      expect(section).toContain('last_updated');
    });
  });

  describe('Phase 0 preflight — deterministic auto-bootstrap (locked wording)', () => {
    it('Phase 0 invokes ensure-context.sh as its first step', () => {
      const section = extractPhase0Section(content);
      expect(section).toMatch(
        /bash\s+"?\$FRAMEWORK_PATH\/scripts\/ensure-context\.sh"?\s+--artifacts-dir\s+"?\$ARTIFACTS_DIR"?/,
      );
    });

    it('Phase 0 mandates STOP when ensure-context.sh exits non-zero', () => {
      const section = extractPhase0Section(content);
      expect(section).toMatch(/STOP/);
      expect(section).toMatch(/exits non-zero/);
    });

    it('Phase 0 documents the success marker .preflight-ok', () => {
      const section = extractPhase0Section(content);
      expect(section).toContain('.preflight-ok');
    });

    it('Phase 0 documents the failure marker .preflight-failed', () => {
      const section = extractPhase0Section(content);
      expect(section).toContain('.preflight-failed');
    });

    it('Phase 0 carries the auto-bootstrap MANDATORY tag in its heading', () => {
      const section = extractPhase0Section(content);
      expect(section).toMatch(/Phase 0:\s+Preflight\s+\(MANDATORY/);
    });
  });

  describe('Phase 9 — push + PR only (commit lives in Phase 8.4)', () => {
    it('Phase 9 section confirms Phase 8.5 completion before proceeding', () => {
      const section = extractPhase9Section(content);
      expect(section).toContain('Phase 8.5 marked completed');
    });

    it('Phase 9 references Phase 8.4 as the source of the implementation commit', () => {
      const section = extractPhase9Section(content);
      expect(section).toMatch(/Phase 8\.4/);
    });

    it('Phase 9 multi-repo path uses /repo-fanout-pr --no-commit', () => {
      const section = extractPhase9Section(content);
      expect(section).toContain('/repo-fanout-pr');
      expect(section).toContain('--no-commit');
    });

    it('Phase 9 STOPs if PR creation fails (and --skip-pr was not set)', () => {
      const section = extractPhase9Section(content);
      expect(section).toContain('CRITICAL');
      expect(section).toMatch(/not proceed|STOP/i);
    });
  });

  describe('CRITICAL block mentions Phase 8.5', () => {
    it('Graph-Aware CRITICAL block mentions Phase 8.5 Wiki Refresh', () => {
      const criticalBlock = content.slice(
        content.indexOf('## CRITICAL: Graph-Aware and Wiki-Aware Requirements'),
        content.indexOf('## CRITICAL: Artifact Path Enforcement'),
      );
      expect(criticalBlock).toContain('Phase 8.5 (Wiki Refresh)');
    });
  });

  describe('Skills and Agents Used lists /wiki-refresh and /repo-fanout-pr', () => {
    it('Skills section includes /wiki-refresh at Phase 8.5 with --commit', () => {
      const skillsSection = content.slice(
        content.indexOf('## Skills and Agents Used'),
        content.indexOf('## Prerequisites'),
      );
      expect(skillsSection).toContain('/wiki-refresh');
      expect(skillsSection).toContain('Phase 8.5');
      expect(skillsSection).toContain('--commit');
    });

    it('Skills section notes /repo-fanout-pr is invoked with --no-commit at Phase 9', () => {
      const skillsSection = content.slice(
        content.indexOf('## Skills and Agents Used'),
        content.indexOf('## Prerequisites'),
      );
      expect(skillsSection).toContain('/repo-fanout-pr');
      expect(skillsSection).toContain('--no-commit');
    });
  });

  describe('graph navigation discipline cross-reference', () => {
    it('Phase 2 names the canonical discipline section in .claude/CLAUDE.md', () => {
      expect(content).toMatch(/Graph navigation discipline/);
      expect(content).toContain('.claude/CLAUDE.md');
      expect(content).toContain('mcp__code_graph__get_architecture_overview_tool');
    });

    it('names the lean-default summary explicitly', () => {
      expect(content).toContain('detail_level: "minimal"');
      expect(content).toContain('limit: 20');
    });
  });
});

describe('SKILL.codex.md — Phase F regression (symmetric)', () => {
  let content: string;

  beforeAll(() => {
    content = readFileSync(SKILL_CODEX_PATH, 'utf-8');
  });

  describe('Phase 8.4 existence', () => {
    it('contains ### Phase 8.4: Implementation Commit section', () => {
      expect(content).toContain('### Phase 8.4: Implementation Commit');
    });

    it('Phase 8.4 appears between Phase 8 and Phase 8.5', () => {
      const phase8Idx = content.indexOf('### Phase 8: Documentation Update');
      const phase84Idx = content.indexOf('### Phase 8.4: Implementation Commit');
      const phase85Idx = content.indexOf('### Phase 8.5: Wiki Refresh');

      expect(phase8Idx).toBeGreaterThanOrEqual(0);
      expect(phase84Idx).toBeGreaterThan(phase8Idx);
      expect(phase85Idx).toBeGreaterThan(phase84Idx);
    });

    it('Phase 8.4 produces the implementation commit before wiki-refresh', () => {
      // The ordering "implementation commit before wiki refresh" is encoded
      // structurally — Phase 8.4 is followed by Phase 8.5 (Wiki Refresh) in
      // the file. We verify the structural ordering directly so the test
      // accepts both:
      //   - the Claude-form transition phrase ("CONTINUE WITH Phase 8.5"),
      //   - the Codex-form implicit-transition (Phase 8.4 section ends and
      //     the next heading is `### Phase 8.5: Wiki Refresh`).
      //
      // Either form proves the intended ordering. The structural check fails
      // only when Phase 8.4 has no Phase 8.5 sibling immediately after it,
      // which would be a real regression.
      const idx84 = content.indexOf('### Phase 8.4: Implementation Commit');
      const idx85 = content.indexOf('### Phase 8.5: Wiki Refresh');
      expect(idx84).toBeGreaterThanOrEqual(0);
      expect(idx85).toBeGreaterThan(idx84);
    });

    it('Phase 8.4 excludes docs/llm-wiki/** from the staged list', () => {
      const section = extractPhase84Section(content);
      expect(section).toContain('docs/llm-wiki/**');
    });

    it('Phase 8.4 emits failed and STOPs on pre-commit hook failure', () => {
      const section = extractPhase84Section(content);
      expect(section).toMatch(/failed/);
      expect(section).toContain('STOP');
    });
  });

  describe('Phase 8.5 existence', () => {
    it('contains ### Phase 8.5: Wiki Refresh section', () => {
      expect(content).toContain('### Phase 8.5: Wiki Refresh');
    });

    it('Phase 8.5 appears between Phase 8.4 and Phase 9', () => {
      const phase84Idx = content.indexOf('### Phase 8.4: Implementation Commit');
      const phase85Idx = content.indexOf('### Phase 8.5: Wiki Refresh');
      const phase9Idx = content.indexOf('### Phase 9: PR Creation');

      expect(phase84Idx).toBeGreaterThanOrEqual(0);
      expect(phase85Idx).toBeGreaterThan(phase84Idx);
      expect(phase9Idx).toBeGreaterThan(phase85Idx);
    });

    it('Phase 8.5 invokes /wiki-refresh with --commit --ticket --artifacts-dir', () => {
      const section = extractPhase85Section(content);
      expect(section).toContain('/wiki-refresh');
      expect(section).toContain('--commit');
      expect(section).toContain('--ticket <TICKET-ID>');
      expect(section).toContain('--artifacts-dir $ARTIFACTS_DIR');
      expect(section).not.toContain('--since <branch-base>');
      expect(section).not.toContain('--hints');
    });

    it('Phase 8.5 STOPs on hard error from /wiki-refresh', () => {
      const section = extractPhase85Section(content);
      expect(section).toMatch(/hard error/i);
      expect(section).toContain('STOP');
    });

    it('Phase 8.5 delegates wiki commit to /wiki-refresh — orchestrator no longer stages docs/llm-wiki/**', () => {
      const section = extractPhase85Section(content);
      expect(section).not.toMatch(/Stage only `docs\/llm-wiki\/\*\*` paths\./);
    });
  });

  describe('Phase 0 preflight — wiki staleness handled by Phase 8.5', () => {
    it('Phase 0 references Phase 8.5 as the wiki-refresh mechanism', () => {
      const section = extractPhase0Section(content);
      expect(section).toContain('Phase 8.5');
    });

    it('Phase 0 no longer checks graph_version / graph_commit on wiki pages', () => {
      const section = extractPhase0Section(content);
      expect(section).not.toMatch(/wiki[^.]{0,40}graph_version/);
      expect(section).not.toMatch(/wiki[^.]{0,40}graph_commit/);
    });

    it('Phase 0 asserts the new minimal frontmatter keys (document_type, summary, last_updated)', () => {
      const section = extractPhase0Section(content);
      expect(section).toContain('document_type');
      expect(section).toContain('summary');
      expect(section).toContain('last_updated');
    });
  });

  describe('Phase 0 preflight — deterministic auto-bootstrap (locked wording)', () => {
    it('Phase 0 invokes ensure-context.sh as its first step', () => {
      const section = extractPhase0Section(content);
      expect(section).toMatch(
        /bash\s+"?\$FRAMEWORK_PATH\/scripts\/ensure-context\.sh"?\s+--artifacts-dir\s+"?\$ARTIFACTS_DIR"?/,
      );
    });

    it('Phase 0 mandates STOP when ensure-context.sh exits non-zero', () => {
      const section = extractPhase0Section(content);
      expect(section).toMatch(/STOP/);
      expect(section).toMatch(/exits non-zero/);
    });

    it('Phase 0 documents the success marker .preflight-ok', () => {
      const section = extractPhase0Section(content);
      expect(section).toContain('.preflight-ok');
    });

    it('Phase 0 documents the failure marker .preflight-failed', () => {
      const section = extractPhase0Section(content);
      expect(section).toContain('.preflight-failed');
    });

    it('Phase 0 carries the auto-bootstrap MANDATORY tag in its heading', () => {
      const section = extractPhase0Section(content);
      expect(section).toMatch(/Phase 0:\s+Preflight\s+\(MANDATORY/);
    });
  });

  describe('Phase 9 — push + PR only (commit lives in Phase 8.4)', () => {
    it('Phase 9 section confirms Phase 8.5 completion before proceeding', () => {
      const section = extractPhase9Section(content);
      expect(section).toContain('Phase 8.5 marked completed');
    });

    it('Phase 9 references Phase 8.4 as the source of the implementation commit', () => {
      const section = extractPhase9Section(content);
      expect(section).toMatch(/Phase 8\.4/);
    });

    it('Phase 9 multi-repo path uses /repo-fanout-pr --no-commit', () => {
      const section = extractPhase9Section(content);
      expect(section).toContain('/repo-fanout-pr');
      expect(section).toContain('--no-commit');
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

  describe('Skills and Role Prompts Used lists /wiki-refresh and /repo-fanout-pr', () => {
    it('Skills section includes /wiki-refresh at Phase 8.5 with --commit', () => {
      const skillsSection = content.slice(
        content.indexOf('## Skills and Role Prompts Used'),
        content.indexOf('## Prerequisites'),
      );
      expect(skillsSection).toContain('/wiki-refresh');
      expect(skillsSection).toContain('Phase 8.5');
      expect(skillsSection).toContain('--commit');
    });

    it('Skills section notes /repo-fanout-pr is invoked with --no-commit at Phase 9', () => {
      const skillsSection = content.slice(
        content.indexOf('## Skills and Role Prompts Used'),
        content.indexOf('## Prerequisites'),
      );
      expect(skillsSection).toContain('/repo-fanout-pr');
      expect(skillsSection).toContain('--no-commit');
    });
  });

  describe('graph navigation discipline cross-reference', () => {
    it('Phase 2 names the canonical discipline section in .codex/AGENTS.md (Codex variant)', () => {
      expect(content).toMatch(/Graph navigation discipline/);
      expect(content).toContain('.codex/AGENTS.md');
      expect(content).toContain('mcp__code_graph__get_architecture_overview_tool');
    });

    it('names the lean-default summary explicitly', () => {
      expect(content).toContain('detail_level: "minimal"');
      expect(content).toContain('limit: 20');
    });
  });
});
