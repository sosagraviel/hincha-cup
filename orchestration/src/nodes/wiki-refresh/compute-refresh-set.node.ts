import { existsSync, readdirSync, readFileSync } from 'fs';
import { join, relative, resolve } from 'path';
import matter from 'gray-matter';
import type { WikiRefreshState } from '../../state/schemas/wiki-refresh.schema.js';
import type { WikiDeltaHint } from '../../services/graph-wiki/wiki-delta-hints.js';

const DEFAULT_MAX_PAGES = 20;
const WIKI_LINK_PATTERN = /\[{1,2}[^\]]*\]{1,2}\(((wiki\/|services\/|\.\.|\.\/)[^\s)]+\.md)\)/g;

interface FrontmatterWithSources {
  sources?: Array<{ path: string }>;
}

/**
 * Determines the minimum set of wiki pages to regenerate. Scans every .md
 * under docs/llm-wiki/wiki/, builds a reverse index from sources[].path to
 * page, expands by one hop of wikilinks, applies optional pages_filter, and
 * caps at WIKI_REFRESH_MAX_PAGES (default 20).
 */
export async function computeRefreshSetNode(
  state: WikiRefreshState,
): Promise<Partial<WikiRefreshState>> {
  const wikiDir = join(state.project_path, 'docs', 'llm-wiki', 'wiki');

  if (!existsSync(wikiDir)) {
    return {
      refresh_set: [],
      current_phase: 'compute_refresh_set',
      errors: [
        `compute_refresh_set: wiki directory not found at ${wikiDir}. Run /initialize-project first.`,
      ],
    };
  }

  const maxPages = resolveMaxPages();
  const wikiPages = collectWikiPages(wikiDir);
  const hints: WikiDeltaHint[] = state.hints ?? [];
  const wikiBase = join('docs', 'llm-wiki', 'wiki');

  if (wikiPages.length === 0) {
    const hintPages = hints.map((h) => join(wikiBase, h.suggested_page));
    const cappedHintPages = hintPages.slice(0, maxPages);
    if (cappedHintPages.length > 0) {
      console.log(
        `Refresh set: ${cappedHintPages.length} pages (0 from diff, ${cappedHintPages.length} from hints)`,
      );
    }
    return {
      refresh_set: cappedHintPages,
      current_phase: 'compute_refresh_set',
    };
  }

  const sourceIndex = buildSourceIndex(wikiPages, state.project_path);
  const wikilinkIndex = buildWikilinkIndex(wikiPages, wikiDir, state.project_path);

  const directlyAffected = new Set<string>();
  for (const changedFile of state.changed_files) {
    const affected = sourceIndex.get(changedFile) ?? [];
    for (const page of affected) {
      directlyAffected.add(page);
    }
  }

  const expandedSet = new Set<string>(directlyAffected);
  for (const page of directlyAffected) {
    const backlinks = wikilinkIndex.get(page) ?? [];
    for (const backlink of backlinks) {
      expandedSet.add(backlink);
    }
  }

  const topLevelPages = wikiPages
    .filter((p) => !p.includes('/services/'))
    .map((p) => relative(state.project_path, p));
  for (const topPage of topLevelPages) {
    if (directlyAffected.size > 0) {
      expandedSet.add(topPage);
    }
  }

  const diffDrivenCount = expandedSet.size;

  for (const hint of hints) {
    const hintPage = join(wikiBase, hint.suggested_page);
    expandedSet.add(hintPage);
  }

  const hintDrivenCount = expandedSet.size - diffDrivenCount;

  let refreshSet = Array.from(expandedSet);

  if (state.pages_filter && state.pages_filter.length > 0) {
    refreshSet = refreshSet.filter((page) =>
      state.pages_filter!.some((filter) => page.includes(filter)),
    );
  }

  if (refreshSet.length === 0 && state.changed_files.length > 0) {
    refreshSet = wikiPages
      .slice(0, Math.min(wikiPages.length, maxPages))
      .map((p) => relative(state.project_path, p));
  }

  const cappedSet = refreshSet.slice(0, maxPages);

  const totalCount = cappedSet.length;
  const diffCount = Math.min(diffDrivenCount, totalCount);
  const hintCount = Math.min(hintDrivenCount, Math.max(0, totalCount - diffCount));
  console.log(`Refresh set: ${totalCount} pages (${diffCount} from diff, ${hintCount} from hints)`);

  return {
    refresh_set: cappedSet,
    current_phase: 'compute_refresh_set',
  };
}

function resolveMaxPages(): number {
  const envValue = process.env.WIKI_REFRESH_MAX_PAGES;
  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_MAX_PAGES;
}

function collectWikiPages(wikiDir: string): string[] {
  const pages: string[] = [];

  function walk(dir: string): void {
    let entries: import('fs').Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true }) as import('fs').Dirent[];
    } catch {
      return;
    }
    for (const entry of entries) {
      const name = entry.name as string;
      const fullPath = join(dir, name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && name.endsWith('.md')) {
        pages.push(fullPath);
      }
    }
  }

  walk(wikiDir);
  return pages;
}

function buildSourceIndex(wikiPages: string[], projectPath: string): Map<string, string[]> {
  const index = new Map<string, string[]>();

  for (const pagePath of wikiPages) {
    let raw: string;
    try {
      raw = readFileSync(pagePath, 'utf-8');
    } catch {
      continue;
    }

    const parsed = matter(raw);
    const frontmatter = parsed.data as FrontmatterWithSources;
    const sources = frontmatter.sources ?? [];

    for (const source of sources) {
      if (!source.path) {
        continue;
      }
      const normalised = source.path.startsWith('/')
        ? relative(projectPath, source.path)
        : source.path;
      const existing = index.get(normalised) ?? [];
      existing.push(relative(projectPath, pagePath));
      index.set(normalised, existing);
    }
  }

  return index;
}

function buildWikilinkIndex(
  wikiPages: string[],
  wikiDir: string,
  projectPath: string,
): Map<string, string[]> {
  const index = new Map<string, string[]>();

  for (const pagePath of wikiPages) {
    let raw: string;
    try {
      raw = readFileSync(pagePath, 'utf-8');
    } catch {
      continue;
    }

    const relativePagePath = relative(projectPath, pagePath);
    let match: RegExpExecArray | null;
    WIKI_LINK_PATTERN.lastIndex = 0;

    while ((match = WIKI_LINK_PATTERN.exec(raw)) !== null) {
      const linkedPath = match[1];
      const resolvedLink = resolve(wikiDir, linkedPath);
      const relativeLink = relative(projectPath, resolvedLink);

      const existing = index.get(relativeLink) ?? [];
      existing.push(relativePagePath);
      index.set(relativeLink, existing);
    }
  }

  return index;
}
