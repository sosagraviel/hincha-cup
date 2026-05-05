import type { AttemptMeta, RunManifest } from '../../debug-store/types.js';
import type { RunStats } from '../../debug-store/run-stats.js';
import { formatCacheHitRate } from '../../debug-store/run-stats.js';
import { escapeHtml } from './html-escape.js';
import { INLINE_STYLES } from './inline-assets.js';

export interface RunIndexAttempt {
  meta: AttemptMeta;
  /** Relative HTML link (relative to the run dir). */
  htmlHref: string | null;
}

export interface RenderRunIndexOptions {
  manifest: RunManifest;
  attempts: RunIndexAttempt[];
  /**
   * Optional run-level aggregate stats (cache hit rate + graph
   * overflow count). When provided, two extra rows render in the
   * sidebar meta-card. Plan §F.6 + commit 9.
   */
  stats?: RunStats;
}

/**
 * Render the run-level index.html: one row per attempt, grouped by phase.
 */
export async function renderRunIndexHtml(opts: RenderRunIndexOptions): Promise<string> {
  const css = INLINE_STYLES;
  const { manifest, attempts, stats } = opts;

  const sorted = [...attempts].sort((a, b) => {
    if (a.meta.phaseNumber !== b.meta.phaseNumber) return a.meta.phaseNumber - b.meta.phaseNumber;
    if (a.meta.agentName < b.meta.agentName) return -1;
    if (a.meta.agentName > b.meta.agentName) return 1;
    return a.meta.attemptNumber - b.meta.attemptNumber;
  });

  const rows: string[] = [];
  let currentPhase = -1;
  for (const entry of sorted) {
    if (entry.meta.phaseNumber !== currentPhase) {
      currentPhase = entry.meta.phaseNumber;
      rows.push(
        `<tr class="phase-row"><td colspan="7">${escapeHtml(entry.meta.phaseLabel ?? entry.meta.phaseId)}</td></tr>`,
      );
    }
    const link = entry.htmlHref
      ? `<a href="${escapeHtml(entry.htmlHref)}">open</a>`
      : '<span style="color:var(--text-dim)">no html</span>';
    rows.push(
      `<tr>
        <td>${escapeHtml(entry.meta.agentName)}</td>
        <td>${escapeHtml(String(entry.meta.attemptNumber ?? ''))}</td>
        <td>${escapeHtml(entry.meta.outcome ?? '')}</td>
        <td>${escapeHtml(entry.meta.provider ?? '')}</td>
        <td>${escapeHtml(formatDuration(entry.meta.durationMs))}</td>
        <td><code>${escapeHtml(entry.meta.sessionId ?? '')}</code></td>
        <td>${link}</td>
      </tr>`,
    );
  }

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Debug run · ${escapeHtml(manifest.runId)}</title>
<style>${css}</style>
</head>
<body>
<div class="app">
  <aside class="sidebar">
    <h1>Debug run</h1>
    <dl class="meta-card">
      ${metaRow('Run', manifest.runId)}
      ${metaRow('Workflow', manifest.workflow)}
      ${metaRow('Provider', manifest.provider)}
      ${metaRow('Model', manifest.model)}
      ${metaRow('Tier', manifest.modelTier)}
      ${metaRow('Started', manifest.startedAt)}
      ${metaRow('Ended', manifest.endedAt)}
      ${metaRow('Duration', formatDuration(manifest.durationMs))}
      ${metaRow('Project', manifest.projectPath)}
      ${metaRow('Git', manifest.gitBranch ? `${manifest.gitBranch}${manifest.gitSha ? ' @ ' + manifest.gitSha.slice(0, 10) : ''}` : undefined)}
      ${stats ? renderStatsRows(stats) : ''}
    </dl>
  </aside>
  <main class="main run-index">
    <h1>Debug run ${escapeHtml(manifest.runId)}</h1>
    <div class="subtitle">${escapeHtml(buildSubtitle(manifest, attempts.length))}</div>
    <table>
      <thead>
        <tr>
          <th>Agent</th>
          <th>Attempt</th>
          <th>Outcome</th>
          <th>Provider</th>
          <th>Duration</th>
          <th>Session</th>
          <th>Transcript</th>
        </tr>
      </thead>
      <tbody>
        ${rows.join('\n')}
      </tbody>
    </table>
    ${renderPhaseStatsRows(sorted)}
  </main>
</div>
</body>
</html>`;
}

function buildSubtitle(manifest: RunManifest, total: number): string {
  const parts: string[] = [`${total} attempt${total === 1 ? '' : 's'}`];
  if (manifest.durationMs !== undefined) parts.push(formatDuration(manifest.durationMs));
  return parts.join(' · ');
}

function metaRow(label: string, value: string | undefined): string {
  if (!value) return '';
  return `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`;
}

/**
 * Render the run-stats rows into the sidebar meta-card.
 *
 *   - `Cache hit rate` — fraction of calls with cache_read > 0.
 *   - `Cached tokens` — total tokens served from cache at ~10% rate
 *     (the actual savings indicator, since hit rate alone doesn't
 *     reveal whether cached prefixes were 100 tokens or 100K).
 *   - `Graph overflows` — count of graph MCP results that exceeded
 *     the per-call token cap.
 *
 * Always rendered when `stats` is supplied — even when values are
 * zero — because the absence of a row is itself misleading (the
 * operator cannot tell whether caching is broken or simply untested).
 *
 * The `Cached tokens` row is omitted only when the value is -1
 * (older runs predate the field-split and have no measurement). Plan
 * §F.6 + commit 9 + codex-parity follow-up (2026-05-05).
 */
function renderStatsRows(stats: RunStats): string {
  const hitText =
    stats.totalAgentCalls === 0
      ? `${formatCacheHitRate(stats.cacheHitRate)} (no calls)`
      : `${formatCacheHitRate(stats.cacheHitRate)} (${stats.cacheHits}/${stats.totalAgentCalls})`;

  const overflowText =
    stats.graphOverflowCount === 0
      ? '0'
      : `${stats.graphOverflowCount}${stats.graphOverflowTools.length > 0 ? ` (${stats.graphOverflowTools.join(', ')})` : ''}`;

  const rows = [metaRow('Cache hit rate', hitText)];

  if (stats.cacheReadInputTokens >= 0) {
    const cachedFmt = formatTokenCount(stats.cacheReadInputTokens);
    const creationFmt =
      stats.cacheCreationInputTokens > 0
        ? ` (+${formatTokenCount(stats.cacheCreationInputTokens)} written)`
        : '';
    rows.push(metaRow('Cached tokens', `${cachedFmt}${creationFmt}`));
  }

  rows.push(metaRow('Graph overflows', overflowText));

  // Plan §C 5.3 (gira-exhaustive followup): soft warnings count +
  // categorisation. Aggregated from every analyzer's output.json
  // soft_warning array (a non-blocking signal vocabulary defined by
  // computeSoftWarnings + applyGraphToolUsageFromSidecar). The row
  // renders only when the optional `softWarningCounts` field is
  // populated — older RunStats fixtures predate §C 5.3 and have no
  // observation to report.
  if (stats.softWarningCounts) {
    const softWarningEntries = Object.entries(stats.softWarningCounts).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    );
    if (softWarningEntries.length === 0) {
      rows.push(metaRow('Soft warnings', '0'));
    } else {
      const total = softWarningEntries.reduce((acc, [, n]) => acc + n, 0);
      const breakdown = softWarningEntries.map(([k, n]) => `${k}: ${n}`).join(', ');
      rows.push(metaRow('Soft warnings', `${total} (${breakdown})`));
    }
  }

  return rows.join('');
}

/**
 * Plan §C 5.3 (gira-exhaustive followup): per-phase attempt
 * statistics. Renders as a small table beneath the main attempt list.
 * Stack-agnostic — reads only `phaseLabel` / `phaseId` and `durationMs`
 * which are framework-defined regardless of project shape.
 */
export function renderPhaseStatsRows(attempts: RunIndexAttempt[]): string {
  const byPhase = new Map<
    string,
    { label: string; durations: number[]; outcomes: Map<string, number> }
  >();
  for (const a of attempts) {
    const key = a.meta.phaseLabel ?? a.meta.phaseId;
    if (!byPhase.has(key)) {
      byPhase.set(key, { label: key, durations: [], outcomes: new Map() });
    }
    const entry = byPhase.get(key)!;
    if (typeof a.meta.durationMs === 'number') entry.durations.push(a.meta.durationMs);
    const outcome = a.meta.outcome ?? 'unknown';
    entry.outcomes.set(outcome, (entry.outcomes.get(outcome) ?? 0) + 1);
  }
  if (byPhase.size === 0) return '';

  const rows: string[] = [];
  for (const [, entry] of byPhase) {
    const n = entry.durations.length;
    const avg = n > 0 ? entry.durations.reduce((a, b) => a + b, 0) / n : 0;
    const max = n > 0 ? Math.max(...entry.durations) : 0;
    const outcomeText = [...entry.outcomes.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    rows.push(
      `<tr>
        <td>${escapeHtml(entry.label)}</td>
        <td>${n}</td>
        <td>${escapeHtml(formatDurationMs(avg))}</td>
        <td>${escapeHtml(formatDurationMs(max))}</td>
        <td>${escapeHtml(outcomeText)}</td>
      </tr>`,
    );
  }
  return `
    <h2>Phase statistics</h2>
    <table>
      <thead>
        <tr>
          <th>Phase</th>
          <th>Attempts</th>
          <th>Avg duration</th>
          <th>Max duration</th>
          <th>Outcomes</th>
        </tr>
      </thead>
      <tbody>
        ${rows.join('\n')}
      </tbody>
    </table>`;
}

function formatDurationMs(ms: number): string {
  return formatDuration(Math.round(ms));
}

/**
 * Format a non-negative token count compactly for the sidebar:
 * `123` / `1.2K` / `12K` / `1.2M`. The denominators are decimal
 * (not 1024-based) because OpenAI/Anthropic bill in raw tokens.
 */
function formatTokenCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}K`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}
