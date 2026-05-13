#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { TOKEN_BUDGETS } from '../services/framework/budgets.js';
import type { BudgetKey } from '../services/framework/budgets.js';
import type { TokenUsageRecord } from '../services/framework/debug-store/index.js';
import {
  resolveTokenUsageJsonlPath,
  resolveMetricsSummaryPath,
} from '../services/framework/debug-store/index.js';
import { getProjectPath } from '../services/framework/paths.service.js';

const program = new Command();

program
  .name('aggregate-metrics')
  .description('Aggregate token-usage JSONL into a per-run summary with SLA comparisons')
  .version('1.0.0')
  .option('--artifacts-dir <path>', 'Override ARTIFACTS_DIR')
  .action(async (options) => {
    try {
      const projectPath = getProjectPath();

      if (options.artifactsDir) {
        process.env.ARTIFACTS_DIR = path.resolve(options.artifactsDir as string);
      }

      const jsonlPath = resolveTokenUsageJsonlPath(projectPath);
      const summaryPath = resolveMetricsSummaryPath(projectPath);

      if (!existsSync(jsonlPath)) {
        const emptyMsg = `# Metrics Summary\n\nNo token-usage data found at \`${jsonlPath}\`.\n`;
        await ensureParentDir(summaryPath);
        await writeFile(summaryPath, emptyMsg, 'utf-8');
        process.stdout.write(`Summary written to: ${summaryPath}\n`);
        return;
      }

      const raw = await readFile(jsonlPath, 'utf-8');
      const records = parseJsonl(raw);

      const summary = buildSummary(records, jsonlPath);

      await ensureParentDir(summaryPath);
      await writeFile(summaryPath, summary, 'utf-8');
      process.stdout.write(`Summary written to: ${summaryPath}\n`);
    } catch (err) {
      process.stderr.write(
        `[aggregate-metrics] error: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  });

program.parse();

function parseJsonl(raw: string): TokenUsageRecord[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as TokenUsageRecord];
      } catch {
        return [];
      }
    });
}

interface PhaseStats {
  input: number;
  output: number;
  duration: number;
}

interface BudgetActual {
  key: BudgetKey;
  actual: number;
  target: number;
  warn: number;
}

/**
 * Builds the full Markdown summary from the parsed JSONL records.
 */
function buildSummary(records: TokenUsageRecord[], jsonlPath: string): string {
  const phaseMap = new Map<string, PhaseStats>();

  for (const rec of records) {
    const phase = rec.phase ?? 'unknown';
    const existing = phaseMap.get(phase) ?? { input: 0, output: 0, duration: 0 };
    phaseMap.set(phase, {
      input: existing.input + (rec.input_tokens > 0 ? rec.input_tokens : 0),
      output: existing.output + (rec.output_tokens > 0 ? rec.output_tokens : 0),
      duration: existing.duration + (rec.duration_ms ?? 0),
    });
  }

  const totalInputKnown = records
    .filter((r) => r.input_tokens > 0)
    .reduce((sum, r) => sum + r.input_tokens, 0);

  const budgetActuals = computeBudgetActuals(records, totalInputKnown);

  const lines: string[] = [];

  lines.push('# Metrics Summary');
  lines.push('');
  lines.push(`Generated at: ${new Date().toISOString()}`);
  lines.push(`Source: \`${jsonlPath}\``);
  lines.push(`Total agent calls: ${records.length}`);
  lines.push('');

  lines.push('## Per-Phase Totals');
  lines.push('');
  lines.push('| Phase | Input tokens | Output tokens | Duration (ms) |');
  lines.push('|-------|-------------|--------------|---------------|');

  const sortedPhases = [...phaseMap.entries()].sort(([a], [b]) => a.localeCompare(b));
  for (const [phase, stats] of sortedPhases) {
    const inputLabel = stats.input === 0 ? 'n/a' : stats.input.toLocaleString();
    const outputLabel = stats.output === 0 ? 'n/a' : stats.output.toLocaleString();
    lines.push(
      `| ${phase} | ${inputLabel} | ${outputLabel} | ${stats.duration.toLocaleString()} |`,
    );
  }
  lines.push('');

  lines.push('## Budget Comparisons');
  lines.push('');
  lines.push('| Budget key | Target | Warn | Actual | Status |');
  lines.push('|-----------|--------|------|--------|--------|');

  const warningLines: string[] = [];

  for (const ba of budgetActuals) {
    const status = resolveStatus(ba);
    const statusLabel = status === 'ok' ? 'ok' : status === 'warn' ? 'WARN' : 'BREACHED';
    lines.push(
      `| ${ba.key} | ${ba.target} | ${ba.warn} | ${ba.actual.toFixed(4)} | ${statusLabel} |`,
    );
    if (status !== 'ok') {
      warningLines.push(
        `- **${ba.key}** ${statusLabel}: actual=${ba.actual.toFixed(4)}, warn=${ba.warn}, target=${ba.target}. ` +
          budgetAdvice(ba.key),
      );
    }
  }
  lines.push('');

  if (warningLines.length > 0) {
    lines.push('## Warnings');
    lines.push('');
    for (const w of warningLines) {
      lines.push(w);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function computeBudgetActuals(
  records: TokenUsageRecord[],
  totalInputKnown: number,
): BudgetActual[] {
  const result: BudgetActual[] = [];

  const graphQueryCount = records.filter(
    (r) => r.budget_key === 'planner_total_graph_queries',
  ).length;
  const wikiPreloadInput = records
    .filter((r) => r.budget_key === 'wiki_preload' && r.input_tokens > 0)
    .reduce((sum, r) => sum + r.input_tokens, 0);
  const overviewInput = records
    .filter((r) => r.budget_key === 'overview_query' && r.input_tokens > 0)
    .reduce((sum, r) => sum + r.input_tokens, 0);
  const minimalContextInput = records
    .filter((r) => r.budget_key === 'minimal_context_per_ticket' && r.input_tokens > 0)
    .reduce((sum, r) => sum + r.input_tokens, 0);

  const base = totalInputKnown > 0 ? totalInputKnown : 1;

  result.push({
    key: 'minimal_context_per_ticket',
    actual: minimalContextInput / base,
    target: TOKEN_BUDGETS.minimal_context_per_ticket.target,
    warn: TOKEN_BUDGETS.minimal_context_per_ticket.warn,
  });

  result.push({
    key: 'wiki_preload',
    actual: wikiPreloadInput / base,
    target: TOKEN_BUDGETS.wiki_preload.target,
    warn: TOKEN_BUDGETS.wiki_preload.warn,
  });

  result.push({
    key: 'overview_query',
    actual: overviewInput / base,
    target: TOKEN_BUDGETS.overview_query.target,
    warn: TOKEN_BUDGETS.overview_query.warn,
  });

  result.push({
    key: 'planner_total_graph_queries',
    actual: graphQueryCount,
    target: TOKEN_BUDGETS.planner_total_graph_queries.target,
    warn: TOKEN_BUDGETS.planner_total_graph_queries.warn,
  });

  return result;
}

function resolveStatus(ba: BudgetActual): 'ok' | 'warn' | 'breached' {
  if (ba.actual > ba.warn) return 'breached';
  if (ba.actual > ba.target) return 'warn';
  return 'ok';
}

function budgetAdvice(key: BudgetKey): string {
  switch (key) {
    case 'minimal_context_per_ticket':
      return 'Reduce the number of files loaded in the minimal context phase or tighten the context filter.';
    case 'wiki_preload':
      return 'Trim the wiki pages preloaded per ticket or reduce wiki page sizes via /wiki-refresh.';
    case 'overview_query':
      return 'Reduce the scope of the overview graph query or cache results across phases.';
    case 'planner_total_graph_queries':
      return 'Refactor the planner to batch graph queries or rely more on the preloaded wiki context.';
  }
}

async function ensureParentDir(filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
}
