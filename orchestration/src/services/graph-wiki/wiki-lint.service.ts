import { createHash } from 'crypto';
import { execSync } from 'child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join, relative, resolve } from 'path';
import matter from 'gray-matter';
import { graphDbPath as canonicalGraphDbPath } from './code-graph.service.js';

export type LintSeverity = 'fail' | 'warn';

export interface LintViolation {
  page: string;
  rule: string;
  severity: LintSeverity;
  message: string;
  evidence?: string;
}

export interface LintReport {
  structural: LintViolation[];
  semantic: LintViolation[];
  stats: {
    pages_scanned: number;
    duration_ms: number;
    graph_version?: string;
  };
}

export interface LintOptions {
  projectPath: string;
  graphDbPath?: string;
  changedPages?: string[];
  skipSemantic?: boolean;
  artifactsDir?: string;
}

const REQUIRED_FRONTMATTER_KEYS = [
  'document_type',
  'graph_version',
  'generated_at',
  'summary',
  'sources',
  'confidence',
] as const;

const EXTERNAL_LINK_RE = /^https?:\/\//;
const ANCHOR_ONLY_RE = /^#/;
const MARKDOWN_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;
const WIKILINK_RE = /\[\[([^\]]+)\]\]/g;
const BACKTICK_SYMBOL_RE = /`([A-Z][a-zA-Z0-9_]+)`/g;
const CODE_BLOCK_RE = /```[\s\S]*?```/g;

/**
 * Run all structural and (optionally) semantic lint checks over the wiki tree
 * at `<projectPath>/docs/llm-wiki/wiki/` and write JSON + Markdown reports to
 * the artifacts directory.
 */
export async function lintLlmWiki(opts: LintOptions): Promise<LintReport> {
  const start = Date.now();
  const projectPath = resolve(opts.projectPath);
  const wikiDir = join(projectPath, 'docs', 'llm-wiki', 'wiki');
  const rawDir = join(projectPath, 'docs', 'llm-wiki', 'raw');
  const artifactsDir = opts.artifactsDir ?? join(projectPath, '.claude-temp', 'wiki-lint');
  const graphDbPath = opts.graphDbPath ?? canonicalGraphDbPath(projectPath);

  const pages = collectMarkdownPages(wikiDir);
  const structural: LintViolation[] = [];
  const semantic: LintViolation[] = [];

  const graphVersion = computeCurrentGraphVersion(graphDbPath);

  for (const page of pages) {
    const relPage = relative(projectPath, page);
    const content = readFileSync(page, 'utf-8');
    const parsed = matter(content);
    const fm = parsed.data as Record<string, unknown>;

    checkMissingFrontmatter(relPage, fm, structural);
    checkBrokenWikilinks(relPage, page, parsed.content, wikiDir, structural);
    checkDeadSources(relPage, fm, projectPath, rawDir, structural);

    if (graphVersion !== undefined) {
      checkGraphVersionMismatch(relPage, fm, graphVersion, semantic);
    }

    checkGraphCommitMismatch(relPage, fm, projectPath, semantic);
  }

  if (!opts.skipSemantic) {
    checkOrphans(pages, wikiDir, projectPath, semantic);
    await checkStaleClaims(pages, projectPath, semantic);
    await checkDispatchBlind(pages, projectPath, semantic);
    await checkContradictions(pages, opts.changedPages ?? [], projectPath, semantic);
  }

  const duration_ms = Date.now() - start;
  const stats = {
    pages_scanned: pages.length,
    duration_ms,
    ...(graphVersion !== undefined ? { graph_version: graphVersion } : {}),
  };

  const report: LintReport = { structural, semantic, stats };
  writeReports(report, artifactsDir);
  return report;
}

function collectMarkdownPages(wikiDir: string): string[] {
  if (!existsSync(wikiDir)) {
    return [];
  }

  const results: string[] = [];

  function walk(dir: string): void {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          results.push(full);
        }
      }
    } catch {}
  }

  walk(wikiDir);
  return results;
}

function computeCurrentGraphVersion(graphDbPath: string): string | undefined {
  if (!existsSync(graphDbPath)) {
    return undefined;
  }
  try {
    const content = readFileSync(graphDbPath);
    return createHash('sha256').update(content).digest('hex');
  } catch {
    return undefined;
  }
}

function resolveCurrentHead(projectPath: string): string | undefined {
  try {
    return execSync('git rev-parse HEAD', { cwd: projectPath, encoding: 'utf-8' }).trim();
  } catch {
    return undefined;
  }
}

function checkMissingFrontmatter(
  relPage: string,
  fm: Record<string, unknown>,
  violations: LintViolation[],
): void {
  for (const key of REQUIRED_FRONTMATTER_KEYS) {
    const value = fm[key];
    const isMissing =
      value === undefined ||
      value === null ||
      (typeof value === 'string' && value.trim() === '') ||
      (Array.isArray(value) && value.length === 0 && key === 'sources' ? false : false);

    if (value === undefined || value === null) {
      violations.push({
        page: relPage,
        rule: 'missing-frontmatter',
        severity: 'fail',
        message: `Missing required frontmatter key: ${key}`,
      });
    }
  }
}

function checkBrokenWikilinks(
  relPage: string,
  pagePath: string,
  body: string,
  wikiDir: string,
  violations: LintViolation[],
): void {
  const pageDir = dirname(pagePath);

  const links: string[] = [];

  let match: RegExpExecArray | null;
  const linkRe = new RegExp(MARKDOWN_LINK_RE.source, 'g');
  while ((match = linkRe.exec(body)) !== null) {
    links.push(match[2]);
  }

  const wikilinkRe = new RegExp(WIKILINK_RE.source, 'g');
  while ((match = wikilinkRe.exec(body)) !== null) {
    links.push(match[1]);
  }

  for (const link of links) {
    const linkTarget = link.split('#')[0];
    if (!linkTarget) continue;
    if (EXTERNAL_LINK_RE.test(linkTarget)) continue;
    if (ANCHOR_ONLY_RE.test(link)) continue;

    const resolved = resolve(pageDir, linkTarget);
    if (!existsSync(resolved)) {
      violations.push({
        page: relPage,
        rule: 'broken-wikilinks',
        severity: 'fail',
        message: `Broken link to "${linkTarget}"`,
        evidence: link,
      });
    }
  }
}

const LEGACY_RAW_SOURCE_PREFIXES = [
  'docs/llm-wiki/raw/analyzers/',
  'docs/llm-wiki/raw/graph-stats/',
];

function checkDeadSources(
  relPage: string,
  fm: Record<string, unknown>,
  projectPath: string,
  rawDir: string,
  violations: LintViolation[],
): void {
  const sources = fm['sources'];
  if (!Array.isArray(sources)) return;

  for (const source of sources) {
    if (!source || typeof source !== 'object') continue;
    const sourcePath = (source as Record<string, unknown>)['path'];
    if (typeof sourcePath !== 'string' || !sourcePath.trim()) continue;

    if (LEGACY_RAW_SOURCE_PREFIXES.some((prefix) => sourcePath.startsWith(prefix))) {
      violations.push({
        page: relPage,
        rule: 'legacy-raw-source',
        severity: 'fail',
        message: `Source path "${sourcePath}" points to a removed raw subdir (analyzers/ or graph-stats/). Re-ingest the page without these citations.`,
        evidence: sourcePath,
      });
      continue;
    }

    const absoluteInProject = join(projectPath, sourcePath);
    const absoluteInRaw = join(rawDir, sourcePath);

    const isUnderValidRaw =
      sourcePath.startsWith('docs/llm-wiki/raw/snapshots/') ||
      sourcePath.startsWith('docs/llm-wiki/raw/external/');

    if (!existsSync(absoluteInProject) && !(isUnderValidRaw && existsSync(absoluteInRaw))) {
      violations.push({
        page: relPage,
        rule: 'dead-sources',
        severity: 'fail',
        message: `Source path does not exist: "${sourcePath}"`,
        evidence: sourcePath,
      });
    }
  }
}

function checkGraphVersionMismatch(
  relPage: string,
  fm: Record<string, unknown>,
  currentGraphVersion: string,
  violations: LintViolation[],
): void {
  const pageGraphVersion = fm['graph_version'];
  if (typeof pageGraphVersion !== 'string') return;

  if (pageGraphVersion !== currentGraphVersion) {
    violations.push({
      page: relPage,
      rule: 'graph-version-mismatch',
      severity: 'warn',
      message: `Page graph_version (${pageGraphVersion.slice(0, 8)}…) does not match current graph DB hash. Run /wiki-refresh to update.`,
      evidence: pageGraphVersion,
    });
  }
}

function checkGraphCommitMismatch(
  relPage: string,
  fm: Record<string, unknown>,
  projectPath: string,
  violations: LintViolation[],
): void {
  const currentHead = resolveCurrentHead(projectPath);
  if (!currentHead) return;

  const pageCommit = fm['graph_commit'];
  if (typeof pageCommit !== 'string') return;

  if (pageCommit !== currentHead) {
    violations.push({
      page: relPage,
      rule: 'graph-commit-mismatch',
      severity: 'warn',
      message: `Page graph_commit (${pageCommit.slice(0, 8)}…) is behind HEAD (${currentHead.slice(0, 8)}…). Run /wiki-refresh.`,
      evidence: pageCommit,
    });
  }
}

function buildInboundLinksIndex(pages: string[], wikiDir: string): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();

  for (const page of pages) {
    const content = readFileSync(page, 'utf-8');
    const parsed = matter(content);
    const body = parsed.content;
    const pageRel = relative(wikiDir, page);
    const pageDir = dirname(page);

    const collectLink = (rawLink: string): void => {
      const target = rawLink.split('#')[0];
      if (!target) return;
      if (EXTERNAL_LINK_RE.test(target)) return;
      if (ANCHOR_ONLY_RE.test(rawLink)) return;

      const resolved = resolve(pageDir, target);
      const targetRel = relative(wikiDir, resolved);
      if (!index.has(targetRel)) {
        index.set(targetRel, new Set());
      }
      index.get(targetRel)!.add(pageRel);
    };

    let match: RegExpExecArray | null;
    const linkRe = new RegExp(MARKDOWN_LINK_RE.source, 'g');
    while ((match = linkRe.exec(body)) !== null) {
      collectLink(match[2]);
    }
    const wikilinkRe = new RegExp(WIKILINK_RE.source, 'g');
    while ((match = wikilinkRe.exec(body)) !== null) {
      collectLink(match[1]);
    }
  }

  return index;
}

function parseIndexNavigation(wikiDir: string): Set<string> {
  const indexPath = join(wikiDir, 'index.md');
  if (!existsSync(indexPath)) return new Set();

  const content = readFileSync(indexPath, 'utf-8');
  const parsed = matter(content);
  const body = parsed.content;
  const mentioned = new Set<string>();

  let match: RegExpExecArray | null;
  const linkRe = new RegExp(MARKDOWN_LINK_RE.source, 'g');
  while ((match = linkRe.exec(body)) !== null) {
    mentioned.add(match[2].split('#')[0]);
  }
  return mentioned;
}

function checkOrphans(
  pages: string[],
  wikiDir: string,
  projectPath: string,
  violations: LintViolation[],
): void {
  const inboundIndex = buildInboundLinksIndex(pages, wikiDir);
  const indexNav = parseIndexNavigation(wikiDir);

  for (const page of pages) {
    const pageRel = relative(wikiDir, page);
    if (pageRel === 'index.md') continue;

    const hasInbound = (inboundIndex.get(pageRel)?.size ?? 0) > 0;
    const inIndex = indexNav.has(pageRel) || Array.from(indexNav).some((n) => n.endsWith(pageRel));

    if (!hasInbound && !inIndex) {
      violations.push({
        page: relative(projectPath, page),
        rule: 'orphans',
        severity: 'warn',
        message: `Page has no inbound wikilinks and is not referenced in index.md navigation.`,
      });
    }
  }
}

async function checkStaleClaims(
  pages: string[],
  projectPath: string,
  violations: LintViolation[],
): Promise<void> {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  for (const page of pages) {
    const content = readFileSync(page, 'utf-8');
    const parsed = matter(content);
    const fm = parsed.data as Record<string, unknown>;

    const sources = fm['sources'];
    if (!Array.isArray(sources) || sources.length === 0) continue;

    const lastVerified = typeof fm['last_verified'] === 'string' ? fm['last_verified'] : undefined;

    let maxIngestedAt: Date | undefined;
    const sourcePaths: string[] = [];

    for (const source of sources) {
      if (!source || typeof source !== 'object') continue;
      const s = source as Record<string, unknown>;
      if (typeof s['ingested_at'] === 'string') {
        const ingestedAt = new Date(s['ingested_at']);
        if (!isNaN(ingestedAt.getTime())) {
          if (!maxIngestedAt || ingestedAt > maxIngestedAt) {
            maxIngestedAt = ingestedAt;
          }
        }
      }
      if (typeof s['path'] === 'string') {
        sourcePaths.push(s['path']);
      }
    }

    if (!maxIngestedAt || maxIngestedAt >= ninetyDaysAgo) continue;

    let anySourceModified = false;
    for (const sourcePath of sourcePaths) {
      const modified = await isSourceNewerThanPage(sourcePath, projectPath, lastVerified);
      if (modified) {
        anySourceModified = true;
        break;
      }
    }

    if (anySourceModified) {
      violations.push({
        page: relative(projectPath, page),
        rule: 'stale-claims',
        severity: 'warn',
        message: `Page sources were last ingested more than 90 days ago and at least one source has been modified since last_verified.`,
        evidence: maxIngestedAt.toISOString(),
      });
    }
  }
}

async function isSourceNewerThanPage(
  sourcePath: string,
  projectPath: string,
  lastVerified: string | undefined,
): Promise<boolean> {
  if (!lastVerified) return false;

  return new Promise<boolean>((resolvePromise) => {
    const timer = setTimeout(() => resolvePromise(false), 500);

    try {
      const result = execSync(`git log -1 --format=%H -- "${sourcePath}"`, {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 500,
      }).trim();
      clearTimeout(timer);
      if (!result) return resolvePromise(false);

      const commitDate = execSync(`git log -1 --format=%aI -- "${sourcePath}"`, {
        cwd: projectPath,
        encoding: 'utf-8',
        timeout: 500,
      }).trim();
      clearTimeout(timer);
      if (!commitDate) return resolvePromise(false);

      const sourceModifiedAt = new Date(commitDate);
      const pageVerifiedAt = new Date(lastVerified);

      if (isNaN(sourceModifiedAt.getTime()) || isNaN(pageVerifiedAt.getTime())) {
        return resolvePromise(false);
      }

      resolvePromise(sourceModifiedAt > pageVerifiedAt);
    } catch {
      clearTimeout(timer);
      resolvePromise(false);
    }
  });
}

async function checkDispatchBlind(
  pages: string[],
  projectPath: string,
  violations: LintViolation[],
): Promise<void> {
  let mcpReachable: boolean | undefined;

  for (const page of pages) {
    const content = readFileSync(page, 'utf-8');
    const parsed = matter(content);
    const body = parsed.content;

    const bodyWithoutCodeBlocks = body.replace(CODE_BLOCK_RE, '');
    const symbols: string[] = [];

    let match: RegExpExecArray | null;
    const symbolRe = new RegExp(BACKTICK_SYMBOL_RE.source, 'g');
    while ((match = symbolRe.exec(bodyWithoutCodeBlocks)) !== null) {
      symbols.push(match[1]);
    }

    if (symbols.length === 0) continue;

    if (mcpReachable === undefined) {
      mcpReachable = await checkMcpReachable();
      if (!mcpReachable) {
        process.stderr.write(
          '[wiki-lint] MCP server not reachable — skipping dispatch-blind check\n',
        );
        return;
      }
    }

    for (const symbol of symbols) {
      const callerCount = await queryMcpCallers(symbol);
      if (callerCount === null) continue;
      if (callerCount > 0) continue;

      const grepCount = countSymbolMatches(symbol, projectPath);
      if (grepCount >= 3) {
        violations.push({
          page: relative(projectPath, page),
          rule: 'dispatch-blind',
          severity: 'warn',
          message: `Symbol \`${symbol}\` has 0 callers in the graph but ≥3 lexical matches in the project tree. Consider verifying the wiki claim is still accurate.`,
          evidence: symbol,
        });
      }
    }
  }
}

async function checkMcpReachable(): Promise<boolean> {
  try {
    const result = execSync('curl -s --max-time 1 http://localhost:3100/health || echo FAIL', {
      encoding: 'utf-8',
      timeout: 1500,
    });
    return !result.includes('FAIL') && result.trim().length > 0;
  } catch {
    return false;
  }
}

async function queryMcpCallers(symbol: string): Promise<number | null> {
  try {
    const result = execSync(
      `curl -s --max-time 1 "http://localhost:3100/query?pattern=callers_of&target=${encodeURIComponent(symbol)}"`,
      { encoding: 'utf-8', timeout: 1500 },
    );
    const parsed = JSON.parse(result) as unknown;
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed && typeof parsed === 'object' && 'count' in parsed) {
      return Number((parsed as Record<string, unknown>)['count']);
    }
    return null;
  } catch {
    return null;
  }
}

function countSymbolMatches(symbol: string, projectPath: string): number {
  try {
    const result = execSync(
      `rg --count-matches "${symbol}" --glob "*.ts" --glob "*.js" --glob "*.py" --glob "*.go" --glob "*.java" . 2>/dev/null | awk -F: '{s+=$2} END{print s}'`,
      { cwd: projectPath, encoding: 'utf-8', timeout: 3000 },
    ).trim();
    const count = parseInt(result, 10);
    return isNaN(count) ? 0 : count;
  } catch {
    return 0;
  }
}

async function checkContradictions(
  pages: string[],
  changedPages: string[],
  projectPath: string,
  violations: LintViolation[],
): Promise<void> {
  if (!changedPages || changedPages.length === 0) return;

  const wikiDir = join(projectPath, 'docs', 'llm-wiki', 'wiki');
  const inboundIndex = buildInboundLinksIndex(pages, wikiDir);

  const checkedPairs = new Set<string>();

  for (const changedPage of changedPages) {
    const changedAbs = resolve(projectPath, changedPage);
    if (!existsSync(changedAbs)) continue;

    const changedRel = relative(wikiDir, changedAbs);
    const backlinks = inboundIndex.get(changedRel) ?? new Set<string>();

    const relatedPages = [changedRel, ...Array.from(backlinks)];

    for (let i = 0; i < relatedPages.length; i++) {
      for (let j = i + 1; j < relatedPages.length; j++) {
        const pairKey = [relatedPages[i], relatedPages[j]].sort().join('|||');
        if (checkedPairs.has(pairKey)) continue;
        checkedPairs.add(pairKey);

        const pageAPath = join(wikiDir, relatedPages[i]);
        const pageBPath = join(wikiDir, relatedPages[j]);

        if (!existsSync(pageAPath) || !existsSync(pageBPath)) continue;

        const contradiction = await detectContradiction(
          pageAPath,
          pageBPath,
          relatedPages[i],
          relatedPages[j],
          projectPath,
        );

        if (contradiction) {
          violations.push(contradiction);
        }
      }
    }
  }
}

async function detectContradiction(
  pageAPath: string,
  pageBPath: string,
  pageARel: string,
  pageBRel: string,
  projectPath: string,
): Promise<LintViolation | null> {
  const snippetA = extractKeySnippets(pageAPath);
  const snippetB = extractKeySnippets(pageBPath);

  if (!snippetA || !snippetB) return null;

  try {
    const prompt = buildContradictionPrompt(snippetA, snippetB, pageARel, pageBRel);
    const result = execSync(
      `echo ${JSON.stringify(prompt)} | claude --print --model claude-haiku-4-5 2>/dev/null || echo NO_CONTRADICTION`,
      { cwd: projectPath, encoding: 'utf-8', timeout: 30000 },
    ).trim();

    if (result.includes('NO_CONTRADICTION') || result.toLowerCase().includes('no contradiction')) {
      return null;
    }

    const evidenceMatch = result.match(/CONTRADICTION:\s*(.+)/i);
    const evidence = evidenceMatch ? evidenceMatch[1].slice(0, 200) : result.slice(0, 200);

    return {
      page: relative(projectPath, pageAPath),
      rule: 'contradictions',
      severity: 'warn',
      message: `Possible factual contradiction with ${pageBRel}.`,
      evidence,
    };
  } catch {
    return null;
  }
}

function extractKeySnippets(pagePath: string): string | null {
  try {
    const content = readFileSync(pagePath, 'utf-8');
    const parsed = matter(content);
    const body = parsed.content;
    const lines = body
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .slice(0, 30);
    return lines.join('\n').slice(0, 800);
  } catch {
    return null;
  }
}

function buildContradictionPrompt(
  snippetA: string,
  snippetB: string,
  pageA: string,
  pageB: string,
): string {
  return (
    `You are a strict fact-checker reviewing two wiki pages for explicit factual contradictions only.\n\n` +
    `Page A (${pageA}):\n${snippetA}\n\n` +
    `Page B (${pageB}):\n${snippetB}\n\n` +
    `Rules: Only flag explicit factual conflicts such as two different function signatures for the same function, ` +
    `different type definitions, or contradictory version numbers. Do NOT flag prose variation or stylistic differences.\n` +
    `If you find a contradiction, respond with: CONTRADICTION: <one-sentence description>\n` +
    `If no contradiction, respond with: NO_CONTRADICTION`
  );
}

function writeReports(report: LintReport, artifactsDir: string): void {
  const lintDir = join(artifactsDir, 'lint');
  mkdirSync(lintDir, { recursive: true });

  writeFileSync(
    join(lintDir, 'wiki-lint-report.json'),
    JSON.stringify(report, null, 2) + '\n',
    'utf-8',
  );

  writeFileSync(join(lintDir, 'wiki-lint-report.md'), buildMarkdownReport(report), 'utf-8');
}

function buildMarkdownReport(report: LintReport): string {
  const lines: string[] = ['# Wiki Lint Report', ''];

  lines.push('## Structural (fail)', '');
  if (report.structural.length === 0) {
    lines.push('No structural violations.', '');
  } else {
    for (const v of report.structural) {
      const evidence = v.evidence ? ` (${v.evidence})` : '';
      lines.push(`- **[${v.rule}]** \`${v.page}\`: ${v.message}${evidence}`);
    }
    lines.push('');
  }

  lines.push('## Semantic (warn)', '');
  if (report.semantic.length === 0) {
    lines.push('No semantic warnings.', '');
  } else {
    for (const v of report.semantic) {
      const evidence = v.evidence ? ` (${v.evidence})` : '';
      lines.push(`- **[${v.rule}]** \`${v.page}\`: ${v.message}${evidence}`);
    }
    lines.push('');
  }

  lines.push('## Stats', '');
  lines.push(`- Pages scanned: ${report.stats.pages_scanned}`);
  lines.push(`- Duration: ${report.stats.duration_ms}ms`);
  if (report.stats.graph_version) {
    lines.push(`- Graph version: ${report.stats.graph_version.slice(0, 8)}…`);
  }
  lines.push('');

  return lines.join('\n');
}
