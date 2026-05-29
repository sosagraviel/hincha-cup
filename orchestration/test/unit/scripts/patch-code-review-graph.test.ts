/**
 * Regression net for `scripts/lib/patch-code-review-graph.py`.
 *
 * The patcher fixes three upstream bugs in `code-review-graph 2.3.2`:
 *
 *   1. analysis_tools.py — five tools call `_validate_repo_root(str)`
 *      directly, raising ``'str' object has no attribute 'resolve'``
 *      on every invocation. Affects:
 *        - get_hub_nodes_tool
 *        - get_bridge_nodes_tool
 *        - get_knowledge_gaps_tool
 *        - get_surprising_connections_tool
 *        - get_suggested_questions_tool
 *
 *   2. graph.py:get_communities_list — SELECTs only `id, name`,
 *      so callers that need `size` see a missing column.
 *
 *   3. analysis.py:find_knowledge_gaps — calls `.get(...)` on
 *      `sqlite3.Row` objects which only support indexing.
 *
 * These tests run the actual Python patcher against synthetic
 * fixtures in a tempdir so we have confidence the patch is
 * idempotent, recognises both broken and already-fixed shapes, and
 * doesn't corrupt files.
 */
import { spawnSync } from 'child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const PATCH_SCRIPT = join(__dirname, '../../../../scripts/lib/patch-code-review-graph.py');

const BROKEN_ANALYSIS_TOOLS_SNIPPET = `"""MCP tool wrappers for graph analysis features."""

from __future__ import annotations
from typing import Any
from ..analysis import find_hub_nodes
from ._common import _get_store, _validate_repo_root


def get_hub_nodes_func(repo_root: str = "", top_n: int = 10) -> dict[str, Any]:
    """docstring"""
    root = _validate_repo_root(repo_root)
    store = _get_store(str(root))
    hubs = find_hub_nodes(store, top_n=top_n)
    return {"hub_nodes": hubs}


def get_bridge_nodes_func(repo_root: str = "", top_n: int = 10) -> dict[str, Any]:
    """docstring"""
    root = _validate_repo_root(repo_root)
    store = _get_store(str(root))
    return {"bridge_nodes": []}
`;

const BROKEN_GRAPH_PY_SNIPPET = `import sqlite3
class GraphStore:
    def get_communities_list(
        self,
    ) -> list[sqlite3.Row]:
        """Return raw rows from the \`\`communities\`\` table."""
        try:
            return self._conn.execute(
                "SELECT id, name FROM communities"
            ).fetchall()
        except sqlite3.OperationalError as exc:
            return []
`;

const BROKEN_ANALYSIS_PY_SNIPPET = `def find_knowledge_gaps(store):
    """Identify structural weaknesses in the codebase graph."""
    edges = store.get_all_edges()
    nodes = store.get_all_nodes(exclude_files=True)

    # 2. Thin communities (< 3 members)
    communities = store.get_communities_list()
    thin = []
    for c in communities:
        if c.get("size", 0) < 3:
            thin.append({"name": c.get("name", "")})
    return {"thin": thin}
`;

let workDir: string;

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), 'patch-crg-'));
});

afterEach(async () => {
  if (workDir) {
    await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
  }
});

/** Plant a synthetic code_review_graph install under a custom $UV_CACHE_DIR
 * so the patcher's discovery logic finds it without touching the real
 * cache. Returns the package root absolute path. */
async function plantCodeReviewGraph(): Promise<string> {
  const uvCache = join(workDir, 'uv-cache');
  // The discovery walks dirs that contain `analysis.py` AND a `tools/` sibling
  // and whose `code_review_graph` is the dir name. Match that shape exactly.
  const pkgRoot = join(uvCache, 'archive-v0', 'fakehash', 'code_review_graph');
  const toolsDir = join(pkgRoot, 'tools');
  await mkdir(toolsDir, { recursive: true });
  await writeFile(join(toolsDir, 'analysis_tools.py'), BROKEN_ANALYSIS_TOOLS_SNIPPET, 'utf-8');
  await writeFile(join(pkgRoot, 'graph.py'), BROKEN_GRAPH_PY_SNIPPET, 'utf-8');
  await writeFile(join(pkgRoot, 'analysis.py'), BROKEN_ANALYSIS_PY_SNIPPET, 'utf-8');
  return pkgRoot;
}

function runPatch(
  uvCache: string,
  ...extra: string[]
): { code: number; stdout: string; stderr: string } {
  const r = spawnSync('python3', [PATCH_SCRIPT, ...extra], {
    env: { ...process.env, UV_CACHE_DIR: uvCache },
    encoding: 'utf-8',
  });
  return { code: r.status ?? -1, stdout: r.stdout, stderr: r.stderr };
}

describe('patch-code-review-graph.py — script existence + sanity', () => {
  it('lives at the documented path', () => {
    expect(existsSync(PATCH_SCRIPT)).toBe(true);
  });

  it('exits 0 cleanly when no code_review_graph install is discoverable', () => {
    // Empty tempdir → no installations to find. Should NOT fail.
    const { code, stderr } = runPatch(workDir);
    expect(code).toBe(0);
    expect(stderr).toMatch(/code_review_graph not found in any discovery path/);
  });
});

describe('patch-code-review-graph.py — bug 1: analysis_tools.py resolve', () => {
  it('patches the broken pattern (str passed to _validate_repo_root)', async () => {
    const pkgRoot = await plantCodeReviewGraph();
    const target = join(pkgRoot, 'tools', 'analysis_tools.py');

    const { code, stderr } = runPatch(join(workDir, 'uv-cache'));
    expect(code).toBe(0);
    expect(stderr).toMatch(/patched.*analysis_tools.py/);

    const after = await readFile(target, 'utf-8');
    expect(after).not.toContain('root = _validate_repo_root(repo_root)');
    expect(after).not.toContain('store = _get_store(str(root))');
    expect(after).toContain('store, _ = _get_store(repo_root)');
    // Idempotence sentinel
    expect(after).toContain('AAF-PATCH: analysis_tools repo_root resolution');
  });

  it('is idempotent — running twice does not double-patch', async () => {
    await plantCodeReviewGraph();
    const target = join(
      workDir,
      'uv-cache',
      'archive-v0',
      'fakehash',
      'code_review_graph',
      'tools',
      'analysis_tools.py',
    );

    runPatch(join(workDir, 'uv-cache'));
    const firstPass = await readFile(target, 'utf-8');

    const { stderr } = runPatch(join(workDir, 'uv-cache'));
    const secondPass = await readFile(target, 'utf-8');

    expect(secondPass).toBe(firstPass);
    expect(stderr).toMatch(/already-patched/);
  });

  it('--check does not modify the file (dry-run)', async () => {
    await plantCodeReviewGraph();
    const target = join(
      workDir,
      'uv-cache',
      'archive-v0',
      'fakehash',
      'code_review_graph',
      'tools',
      'analysis_tools.py',
    );
    const before = await readFile(target, 'utf-8');

    const { code, stderr } = runPatch(join(workDir, 'uv-cache'), '--check');
    expect(code).toBe(0);
    expect(stderr).toMatch(/patched/); // would-be-patched
    const after = await readFile(target, 'utf-8');
    expect(after).toBe(before);
  });

  it('reports already-fixed when upstream releases the canonical shape', async () => {
    const pkgRoot = await plantCodeReviewGraph();
    // Overwrite analysis_tools.py with the upstream-fixed shape.
    const fixed = BROKEN_ANALYSIS_TOOLS_SNIPPET.replace(
      /root = _validate_repo_root\(repo_root\)\n {4}store = _get_store\(str\(root\)\)/g,
      'store, _ = _get_store(repo_root)',
    );
    await writeFile(join(pkgRoot, 'tools', 'analysis_tools.py'), fixed, 'utf-8');

    const { code, stderr } = runPatch(join(workDir, 'uv-cache'));
    expect(code).toBe(0);
    expect(stderr).toMatch(/already-fixed/);
  });
});

describe('patch-code-review-graph.py — bug 2: graph.py get_communities_list SELECT', () => {
  it('extends the SELECT to include size + sibling columns', async () => {
    const pkgRoot = await plantCodeReviewGraph();
    const graphPy = join(pkgRoot, 'graph.py');

    runPatch(join(workDir, 'uv-cache'));
    const after = await readFile(graphPy, 'utf-8');

    expect(after).toContain(
      'SELECT id, name, level, parent_id, cohesion, size, dominant_language, description FROM communities',
    );
    expect(after).not.toContain('"SELECT id, name FROM communities"');
    expect(after).toContain('AAF-PATCH: get_communities_list extended SELECT');
  });

  it('is idempotent on graph.py', async () => {
    await plantCodeReviewGraph();
    const graphPy = join(
      workDir,
      'uv-cache',
      'archive-v0',
      'fakehash',
      'code_review_graph',
      'graph.py',
    );

    runPatch(join(workDir, 'uv-cache'));
    const first = await readFile(graphPy, 'utf-8');
    runPatch(join(workDir, 'uv-cache'));
    const second = await readFile(graphPy, 'utf-8');
    expect(second).toBe(first);
  });
});

describe('patch-code-review-graph.py — bug 3: analysis.py rows-to-dict', () => {
  it('converts get_communities_list rows to dicts in find_knowledge_gaps', async () => {
    const pkgRoot = await plantCodeReviewGraph();
    const analysisPy = join(pkgRoot, 'analysis.py');

    runPatch(join(workDir, 'uv-cache'));
    const after = await readFile(analysisPy, 'utf-8');

    expect(after).toContain('communities = [dict(c) for c in store.get_communities_list()]');
    expect(after).not.toMatch(/^\s+communities = store\.get_communities_list\(\)$/m);
    expect(after).toContain('AAF-PATCH: rows-to-dict for find_knowledge_gaps');
  });
});

describe('patch-code-review-graph.py — multi-installation discovery', () => {
  it('patches every code_review_graph install under the cache dir', async () => {
    // Two synthetic installs, both broken.
    const uvCache = join(workDir, 'uv-cache');
    for (const hash of ['hashA', 'hashB']) {
      const pkgRoot = join(uvCache, 'archive-v0', hash, 'code_review_graph');
      await mkdir(join(pkgRoot, 'tools'), { recursive: true });
      await writeFile(
        join(pkgRoot, 'tools', 'analysis_tools.py'),
        BROKEN_ANALYSIS_TOOLS_SNIPPET,
        'utf-8',
      );
      await writeFile(join(pkgRoot, 'graph.py'), BROKEN_GRAPH_PY_SNIPPET, 'utf-8');
      await writeFile(join(pkgRoot, 'analysis.py'), BROKEN_ANALYSIS_PY_SNIPPET, 'utf-8');
    }

    const { code, stderr } = runPatch(uvCache);
    expect(code).toBe(0);
    // 6 patched files: 2 analysis_tools, 2 graph.py, 2 analysis.py
    const summary = stderr.match(/processed (\d+) file\(s\) across (\d+) bug groups/);
    expect(summary).not.toBeNull();
    expect(parseInt(summary![1], 10)).toBe(6);

    // All three files in BOTH installations should be patched.
    for (const hash of ['hashA', 'hashB']) {
      const at = await readFile(
        join(uvCache, 'archive-v0', hash, 'code_review_graph', 'tools', 'analysis_tools.py'),
        'utf-8',
      );
      expect(at).toContain('store, _ = _get_store(repo_root)');
      const gp = await readFile(
        join(uvCache, 'archive-v0', hash, 'code_review_graph', 'graph.py'),
        'utf-8',
      );
      expect(gp).toContain('SELECT id, name, level');
      const ap = await readFile(
        join(uvCache, 'archive-v0', hash, 'code_review_graph', 'analysis.py'),
        'utf-8',
      );
      expect(ap).toContain('[dict(c) for c in store.get_communities_list()]');
    }
  });
});
