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
 * Render the two run-stats rows into the sidebar meta-card
 * (cache hit rate + graph overflow count). Plan §F.6 + commit 9.
 *
 * Always rendered when `stats` is supplied — even when both values
 * are zero — because the absence of a row is itself misleading
 * (the operator cannot tell whether caching is broken or simply
 * untested).
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

  return [metaRow('Cache hit rate', hitText), metaRow('Graph overflows', overflowText)].join('');
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}
