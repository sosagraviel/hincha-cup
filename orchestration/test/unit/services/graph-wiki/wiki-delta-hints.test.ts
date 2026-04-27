import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  parseWikiDeltaHints,
  readWikiDeltaHintsFile,
  serializeWikiDeltaHints,
} from '../../../../src/services/graph-wiki/wiki-delta-hints.js';
import type { WikiDeltaHint } from '../../../../src/services/graph-wiki/wiki-delta-hints.js';

const VALID_HINT_1: WikiDeltaHint = {
  file_path: 'src/auth/oauth.py',
  suggested_page: 'services/auth.md',
  action: 'update',
  reason: 'added GoogleOAuthProvider class',
};

const VALID_HINT_2: WikiDeltaHint = {
  file_path: 'src/auth/oauth.py',
  suggested_page: 'PATTERNS.md',
  action: 'update',
  reason: 'introduces OAuth retry pattern',
};

const VALID_HINT_3: WikiDeltaHint = {
  file_path: 'src/billing/invoice.ts',
  suggested_page: 'services/billing.md',
  action: 'add',
  reason: 'new InvoicePDF generator service',
};

function makeSummaryWithHints(hintsJsonl: string): string {
  return `## Summary\n\nSome implementation details.\n\n## Wiki Delta Hints\n\n\`\`\`jsonl\n${hintsJsonl}\`\`\`\n\nEnd of summary.`;
}

describe('parseWikiDeltaHints', () => {
  it('parses a summary with a valid block containing three hints', () => {
    const jsonl =
      [VALID_HINT_1, VALID_HINT_2, VALID_HINT_3].map((h) => JSON.stringify(h)).join('\n') + '\n';
    const summary = makeSummaryWithHints(jsonl);

    const result = parseWikiDeltaHints(summary);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual(VALID_HINT_1);
    expect(result[1]).toEqual(VALID_HINT_2);
    expect(result[2]).toEqual(VALID_HINT_3);
  });

  it('parses a summary with an empty block and returns zero hints', () => {
    const summary = makeSummaryWithHints('');

    const result = parseWikiDeltaHints(summary);

    expect(result).toEqual([]);
  });

  it('returns empty array when the block is absent (backward-compat with old implementer outputs)', () => {
    const summary = '## Summary\n\nImplemented the feature.\n\nFiles changed:\n- src/foo.ts';

    const result = parseWikiDeltaHints(summary);

    expect(result).toEqual([]);
  });

  it('throws with the line number when a JSON line is malformed', () => {
    const jsonl = JSON.stringify(VALID_HINT_1) + '\n' + 'not valid json' + '\n';
    const summary = makeSummaryWithHints(jsonl);

    expect(() => parseWikiDeltaHints(summary)).toThrow(/line 2/);
  });

  it('throws when a line fails Zod schema validation (invalid action)', () => {
    const bad = { ...VALID_HINT_1, action: 'rewrite' };
    const jsonl = JSON.stringify(bad) + '\n';
    const summary = makeSummaryWithHints(jsonl);

    expect(() => parseWikiDeltaHints(summary)).toThrow(/line 1/);
  });

  it('accepts hints with extra unknown keys (Zod strips them silently)', () => {
    const withExtra = { ...VALID_HINT_1, unknown_field: 'ignored' };
    const jsonl = JSON.stringify(withExtra) + '\n';
    const summary = makeSummaryWithHints(jsonl);

    const result = parseWikiDeltaHints(summary);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(VALID_HINT_1);
    expect((result[0] as Record<string, unknown>)['unknown_field']).toBeUndefined();
  });
});

describe('serializeWikiDeltaHints and readWikiDeltaHintsFile', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'wiki-delta-hints-test-'));
  });

  afterEach(() => {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('round-trips hints: serialize → write → read → equals input', () => {
    const hints: WikiDeltaHint[] = [VALID_HINT_1, VALID_HINT_2, VALID_HINT_3];
    const filePath = join(tmpDir, 'hints.jsonl');

    const serialized = serializeWikiDeltaHints(hints);
    writeFileSync(filePath, serialized, 'utf-8');

    const loaded = readWikiDeltaHintsFile(filePath);

    expect(loaded).toEqual(hints);
  });

  it('serializes an empty hints array to an empty string', () => {
    const result = serializeWikiDeltaHints([]);
    expect(result).toBe('');
  });

  it('readWikiDeltaHintsFile skips comment lines and blank lines', () => {
    const filePath = join(tmpDir, 'hints-with-comments.jsonl');
    const content = [
      '# This is a comment',
      '',
      JSON.stringify(VALID_HINT_1),
      '  ',
      '# Another comment',
      JSON.stringify(VALID_HINT_2),
    ].join('\n');
    writeFileSync(filePath, content, 'utf-8');

    const result = readWikiDeltaHintsFile(filePath);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(VALID_HINT_1);
    expect(result[1]).toEqual(VALID_HINT_2);
  });

  it('readWikiDeltaHintsFile throws with path and line number on malformed JSON', () => {
    const filePath = join(tmpDir, 'bad.jsonl');
    writeFileSync(filePath, JSON.stringify(VALID_HINT_1) + '\nbad json\n', 'utf-8');

    expect(() => readWikiDeltaHintsFile(filePath)).toThrow(/line 2/);
    expect(() => readWikiDeltaHintsFile(filePath)).toThrow(filePath);
  });

  it('readWikiDeltaHintsFile throws with line number on schema validation failure', () => {
    const filePath = join(tmpDir, 'invalid.jsonl');
    const bad = {
      file_path: 'src/foo.ts',
      suggested_page: 'PATTERNS.md',
      action: 'bad',
      reason: 'x',
    };
    writeFileSync(filePath, JSON.stringify(bad) + '\n', 'utf-8');

    expect(() => readWikiDeltaHintsFile(filePath)).toThrow(/line 1/);
  });
});
