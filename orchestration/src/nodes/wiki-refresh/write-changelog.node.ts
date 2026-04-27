import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { WikiRefreshState, GeneratedPage } from '../../state/schemas/wiki-refresh.schema.js';

const UNRELEASED_HEADING = '## [Unreleased]';

/**
 * Appends a structured entry to docs/llm-wiki/CHANGELOG.md following
 * Keep-a-Changelog conventions. Computes Added/Changed/Removed sections
 * by diffing generated_pages against prior on-disk content.
 */
export async function writeChangelogNode(
  state: WikiRefreshState,
): Promise<Partial<WikiRefreshState>> {
  if (state.dry_run) {
    return { current_phase: 'write_changelog' };
  }

  const changelogPath = join(state.project_path, 'docs', 'llm-wiki', 'CHANGELOG.md');

  const existing = readExistingChangelog(changelogPath);
  const { added, changed, removed } = classifyChanges(state.generated_pages, state.project_path);

  if (added.length === 0 && changed.length === 0 && removed.length === 0) {
    return { current_phase: 'write_changelog' };
  }

  const entry = buildChangelogEntry(added, changed, removed);
  const updated = insertUnderUnreleased(existing, entry);

  return {
    generated_pages: [
      {
        filename: 'docs/llm-wiki/CHANGELOG.md',
        content: updated,
      },
    ],
    current_phase: 'write_changelog',
  };
}

function readExistingChangelog(changelogPath: string): string {
  if (!existsSync(changelogPath)) {
    return [
      '# Changelog',
      '',
      'All notable changes to this wiki are documented in this file.',
      '',
      'The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).',
      '',
      UNRELEASED_HEADING,
      '',
    ].join('\n');
  }
  return readFileSync(changelogPath, 'utf-8');
}

function classifyChanges(
  generatedPages: GeneratedPage[],
  projectPath: string,
): { added: string[]; changed: string[]; removed: string[] } {
  const added: string[] = [];
  const changed: string[] = [];
  const removed: string[] = [];

  for (const page of generatedPages) {
    if (
      page.filename === 'docs/llm-wiki/CHANGELOG.md' ||
      page.filename === 'docs/llm-wiki/log.md'
    ) {
      continue;
    }
    const absolutePath = join(projectPath, page.filename);
    if (!existsSync(absolutePath)) {
      added.push(page.filename);
    } else {
      const prior = readFileSync(absolutePath, 'utf-8');
      if (prior !== page.content) {
        changed.push(page.filename);
      }
    }
  }

  return { added, changed, removed };
}

function buildChangelogEntry(added: string[], changed: string[], removed: string[]): string {
  const lines: string[] = [];

  if (added.length > 0) {
    lines.push('### Added');
    for (const file of added) {
      lines.push(`- ${file}`);
    }
    lines.push('');
  }

  if (changed.length > 0) {
    lines.push('### Changed');
    for (const file of changed) {
      lines.push(`- ${file}`);
    }
    lines.push('');
  }

  if (removed.length > 0) {
    lines.push('### Removed');
    for (const file of removed) {
      lines.push(`- ${file}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function insertUnderUnreleased(existing: string, entry: string): string {
  const unreleasedIndex = existing.indexOf(UNRELEASED_HEADING);
  if (unreleasedIndex === -1) {
    return `${existing}\n${UNRELEASED_HEADING}\n\n${entry}`;
  }

  const afterHeading = unreleasedIndex + UNRELEASED_HEADING.length;
  const before = existing.slice(0, afterHeading);
  const after = existing.slice(afterHeading);

  return `${before}\n\n${entry}${after}`;
}
