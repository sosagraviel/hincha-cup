import { describe, it, expect } from 'vitest';
import { rewriteAgentFrontmatter } from '../../../../../../src/nodes/initialize-project/phase5/helpers/agent-frontmatter.js';
import { Provider } from '../../../../../../src/providers/types.js';

const CLAUDE_AGENT = `---
name: planner
description: Create detailed plans
model: opus
tools: Read, Grep, Glob
skills:
  - project-context
---

# Planner
Body stays.
`;

describe('rewriteAgentFrontmatter', () => {
  it('returns content unchanged for Claude', () => {
    expect(rewriteAgentFrontmatter(CLAUDE_AGENT, Provider.CLAUDE)).toBe(CLAUDE_AGENT);
  });

  it('remaps opus model to Codex flagship', () => {
    const out = rewriteAgentFrontmatter(CLAUDE_AGENT, Provider.CODEX);
    expect(out).toMatch(/model: gpt-5\.4/);
    expect(out).not.toMatch(/model: opus/);
  });

  it('remaps sonnet model to Codex flagship', () => {
    const input = CLAUDE_AGENT.replace('model: opus', 'model: sonnet');
    const out = rewriteAgentFrontmatter(input, Provider.CODEX);
    expect(out).toMatch(/model: gpt-5\.4/);
    expect(out).not.toMatch(/model: sonnet/);
  });

  it('remaps haiku model to the mini Codex variant', () => {
    const input = CLAUDE_AGENT.replace('model: opus', 'model: haiku');
    const out = rewriteAgentFrontmatter(input, Provider.CODEX);
    expect(out).toMatch(/model: gpt-5\.4-mini/);
  });

  it('removes tools: line entirely for Codex', () => {
    const out = rewriteAgentFrontmatter(CLAUDE_AGENT, Provider.CODEX);
    expect(out).not.toMatch(/^tools\s*:/m);
  });

  it('preserves body verbatim', () => {
    const out = rewriteAgentFrontmatter(CLAUDE_AGENT, Provider.CODEX);
    expect(out).toMatch(/# Planner\nBody stays\./);
  });

  it('preserves name/description/skills', () => {
    const out = rewriteAgentFrontmatter(CLAUDE_AGENT, Provider.CODEX);
    expect(out).toMatch(/name: planner/);
    expect(out).toMatch(/description: Create detailed plans/);
    expect(out).toMatch(/skills:\n\s+- project-context/);
  });

  it('returns content unchanged when frontmatter is absent', () => {
    const input = '# No frontmatter\nJust markdown';
    expect(rewriteAgentFrontmatter(input, Provider.CODEX)).toBe(input);
  });

  it('falls back to default Codex model for unknown alias', () => {
    const input = CLAUDE_AGENT.replace('model: opus', 'model: unknown-alias');
    const out = rewriteAgentFrontmatter(input, Provider.CODEX);
    expect(out).toMatch(/model: gpt-5\.4/);
  });
});
