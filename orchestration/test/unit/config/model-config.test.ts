/**
 * Plan v5 §1.2 — regression test: every tier covers every known agent.
 *
 * Closes the v3/v4 bug class where a new agent name was added to the
 * codebase (e.g. `service-detail-extractor` in v4 Phase D) but never
 * registered in any `tiers.<tier>.agents` map, causing the agent to
 * silently fall back to a default model regardless of `MODEL_TIER`.
 *
 * This test fails CI when:
 *   - A new agent name is added without entries in EVERY tier.
 *   - A tier is missing one of the canonical agent names.
 *   - The `fast` tier (which v5 dedicates to fixture iteration) maps
 *     anything to a non-Haiku model.
 *
 * No LLM, no spawn, no I/O beyond a single config file read.
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, it } from 'vitest';

interface AgentValue {
  alias?: string;
  reasoningEffort?: string;
}

interface Tier {
  description: string;
  provider: string;
  agents: Record<string, string | AgentValue>;
}

interface ModelConfig {
  version: string;
  modelAliases: Record<string, { provider: string; modelId: string }>;
  tiers: Record<string, Tier>;
  providerConfig: Record<string, unknown>;
}

const CONFIG_PATH = join(__dirname, '../../../config/model-config.json');
const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')) as ModelConfig;

/**
 * Canonical set of agent names the framework knows about. Every name
 * here must be registered in EVERY tier. When the codebase adds a new
 * agent, the contributor adds the name here AND to every tier in
 * `model-config.json` in the same PR.
 *
 * Derived from grep against the codebase for `agentName: '<name>'` and
 * the `getCLIModelForAgent` / `getCodexCLIModelForAgent` call sites.
 */
const CANONICAL_AGENT_NAMES: ReadonlyArray<string> = [
  // Phase 0–6 init-project pipeline
  'structure-architecture-analyzer',
  'tech-stack-dependencies-analyzer',
  'code-patterns-testing-analyzer',
  'data-flows-integrations-analyzer',
  'service-detail-extractor',
  'architect-synthesizer',
  'wiki-generator',
  'question-consolidator',
  // implement-ticket + scaffold agents
  'planner',
  'implementer',
  'implementer-generic',
  'implementer-typescript',
  'implementer-python',
  'implementer-go',
  'implementer-java',
  'implementer-rust',
  'reviewer',
  'visual-verifier',
];

const ALL_TIER_NAMES = Object.keys(config.tiers);

describe('model-config.json — tier coverage (v5 §1.2 regression)', () => {
  it('exposes at least the expected tiers', () => {
    for (const tier of ['standard', 'fast', 'advanced', 'openai', 'gemini']) {
      expect(ALL_TIER_NAMES).toContain(tier);
    }
  });

  describe.each(ALL_TIER_NAMES)('tier: %s', (tierName) => {
    const tier = config.tiers[tierName];

    it.each(CANONICAL_AGENT_NAMES)(`covers agent '%s' (no silent fallback)`, (agentName) => {
      expect(tier.agents).toHaveProperty(agentName);
      const value = tier.agents[agentName];
      expect(value, `tier '${tierName}' agent '${agentName}' must be defined`).toBeDefined();
    });

    it('every agent value resolves to a known model alias', () => {
      const aliases = new Set(Object.keys(config.modelAliases));
      for (const [agentName, value] of Object.entries(tier.agents)) {
        const aliasName = typeof value === 'string' ? value : value.alias;
        expect(
          aliasName,
          `tier '${tierName}' agent '${agentName}' must declare an alias`,
        ).toBeTruthy();
        expect(
          aliases,
          `unknown alias '${aliasName}' for '${agentName}' in tier '${tierName}'`,
        ).toContain(aliasName);
      }
    });
  });
});

describe('model-config.json — `fast` tier is fixture-grade Haiku-only', () => {
  // v5 §1.2 dedicates the `fast` tier to test-fixture iteration. Every
  // agent — analyzers, synthesis, wiki, implement-ticket / planner /
  // reviewer / visual-verifier — runs on haiku-latest so a single
  // MODEL_TIER=fast invocation gives an end-to-end Haiku pipeline.
  // This test catches any drive-by edit that puts a non-Haiku model
  // back into the `fast` tier (the v4 hybrid Phase-1-Haiku/synthesis-
  // Sonnet shape this plan retires).

  const fastAgents = config.tiers.fast.agents;

  it.each(Object.keys(fastAgents))('agent %s in fast tier → haiku-latest', (agentName) => {
    const value = fastAgents[agentName];
    const aliasName = typeof value === 'string' ? value : value.alias;
    expect(aliasName).toBe('haiku-latest');
  });

  it('haiku-latest alias resolves to a real claude-haiku model id', () => {
    const haiku = config.modelAliases['haiku-latest'];
    expect(haiku).toBeDefined();
    expect(haiku.modelId).toMatch(/^claude-haiku-/);
    expect(haiku.provider).toBe('anthropic');
  });
});

describe('model-config.json — `service-detail-extractor` registered everywhere (v4 Phase D + v5 §1.2)', () => {
  // Specific anti-regression: Phase D added the service-detail-extractor
  // sub-agent but the v4 commit missed registering it in any tier, so
  // it silently fell back to a default. This test pins down the fix.

  it.each(ALL_TIER_NAMES)(`tier '%s' maps service-detail-extractor`, (tierName) => {
    expect(config.tiers[tierName].agents).toHaveProperty('service-detail-extractor');
  });
});
