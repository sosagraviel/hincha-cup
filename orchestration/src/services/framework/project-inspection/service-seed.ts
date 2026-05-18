/**
 * Derive a stack-agnostic service seed directly from the Phase 0 project
 * inspection. Used by the downstream Phase 1 analyzers (tech-stack,
 * code-patterns, data-flows) when the structure-architecture-analyzer's
 * output has not been persisted yet — so the four analyzers can fan out in
 * parallel without re-introducing the cross-analyzer ID drift that
 * commit `e7de7d0` originally fixed.
 *
 * The seed is a deterministic projection of `inspection.manifests[]`:
 *   id   = basename(dirname(manifest.path)) || basename(project root)
 *   path = dirname(manifest.path) || '.'
 *   type = best-effort inference from manifest + raw dependencies
 *   language = the language-key from the manifest's registered language
 *
 * The structure-analyzer remains the SINGLE SOURCE OF TRUTH; the seed is
 * a transient bootstrap. Phase 2 consolidation reconciles seed-derived IDs
 * against structure's final services[] before any artefact is generated
 * (see `applyServiceIdRewritesToFindings`).
 */

import { basename, dirname } from 'path';
import type {
  ProjectInspection,
  ManifestEntry,
} from '../../../schemas/project-inspection.schema.js';
import { resolveManifestEntry } from '../language-config/index.js';
import type { AuthoritativeService } from '../../../nodes/initialize-project/phase1/shared/authoritative-services.js';

const HTTP_FRAMEWORK_TOKENS = new Set([
  'express',
  'fastify',
  'koa',
  '@nestjs/core',
  '@nestjs/common',
  'hapi',
  'restify',
  'fastapi',
  'flask',
  'django',
  'starlette',
  'tornado',
  'sanic',
  'aiohttp',
  'bottle',
  'falcon',
  'pyramid',
  'gin',
  'echo',
  'fiber',
  'chi',
  'iris',
  'beego',
  'revel',
  'spring-boot',
  'spring-webmvc',
  'micronaut',
  'quarkus',
  'http4k',
  'ktor',
  'rails',
  'sinatra',
  'rocket',
  'actix-web',
  'axum',
  'warp',
  'hyper',
  'asp.net',
  'asp.net-core',
  'aspnetcore',
  'phoenix',
  'cowboy',
  'plug',
  'shelf',
]);

const FRONTEND_FRAMEWORK_TOKENS = new Set([
  'react',
  'react-dom',
  'next',
  'remix',
  'gatsby',
  'vue',
  'nuxt',
  '@angular/core',
  '@angular/cli',
  'svelte',
  'sveltekit',
  '@sveltejs/kit',
  'solid-js',
  'preact',
  'qwik',
  '@builder.io/qwik',
  'astro',
]);

const SERVERLESS_TOKENS = new Set([
  'firebase-functions',
  'firebase-admin',
  'aws-lambda',
  '@aws-sdk/client-lambda',
  'serverless',
  'serverless-http',
  '@vercel/node',
  '@vercel/functions',
  '@cloudflare/workers-types',
  'wrangler',
  'azure-functions-core-tools',
  'functions-framework',
  'mangum',
  'chalice',
]);

const WORKER_TOKENS = new Set([
  'bullmq',
  'bull',
  'agenda',
  'celery',
  'rq',
  'dramatiq',
  'huey',
  'asynq',
  'sidekiq',
  'resque',
  'shoryuken',
  'hangfire',
]);

const CLI_TOKENS = new Set([
  'commander',
  'yargs',
  'meow',
  'cac',
  'oclif',
  'click',
  'typer',
  'argparse',
  'docopt',
  'clap',
  'structopt',
  'argh',
  'cobra',
  'urfave/cli',
  'kingpin',
  'thor',
  'gli',
  'picocli',
  'jcommander',
  'commons-cli',
]);

const MOBILE_TOKENS = new Set([
  'react-native',
  '@react-native/core',
  'expo',
  '@expo/cli',
  'flutter',
  'capacitor',
  'cordova',
  'ionic',
]);

type ServiceTypeToken =
  | 'backend'
  | 'frontend'
  | 'serverless'
  | 'worker'
  | 'cli'
  | 'library'
  | 'mobile'
  | 'infrastructure'
  | 'desktop';

/**
 * Collect every dependency name appearing in a parsed manifest (any package
 * manager). The walker pulls strings out of `dependencies`,
 * `devDependencies`, `peerDependencies`, `optionalDependencies` for npm-style
 * manifests; `[project.dependencies]` / `[tool.poetry.dependencies]` /
 * `[dependencies]` / `[require]` / `gems` etc. for the others. Falls back to
 * a recursive scan when the manifest shape is unfamiliar — we return all
 * string values to the caller and let the token sets do the matching.
 */
function collectDependencyTokens(raw: unknown): Set<string> {
  const tokens = new Set<string>();
  if (raw === null || typeof raw !== 'object') return tokens;

  const visited = new Set<unknown>();
  const stack: unknown[] = [raw];
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== 'object' || visited.has(node)) continue;
    visited.add(node);
    if (Array.isArray(node)) {
      for (const item of node) {
        if (typeof item === 'string') tokens.add(item.toLowerCase());
        else if (item && typeof item === 'object') stack.push(item);
      }
      continue;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (typeof value === 'string') {
        const k = key.toLowerCase();
        if (
          k === 'dependencies' ||
          k === 'devdependencies' ||
          k === 'peerdependencies' ||
          k === 'optionaldependencies' ||
          k === 'require' ||
          k === 'require-dev' ||
          k === 'gems'
        ) {
          tokens.add(value.toLowerCase());
        }
      }
      if (value && typeof value === 'object') stack.push(value);
    }
  }

  if ('dependencies' in (raw as Record<string, unknown>)) {
    const deps = (raw as Record<string, unknown>)['dependencies'];
    if (deps && typeof deps === 'object' && !Array.isArray(deps)) {
      for (const k of Object.keys(deps as Record<string, unknown>)) {
        tokens.add(k.toLowerCase());
      }
    }
  }
  for (const field of ['devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const deps = (raw as Record<string, unknown>)[field];
    if (deps && typeof deps === 'object' && !Array.isArray(deps)) {
      for (const k of Object.keys(deps as Record<string, unknown>)) {
        tokens.add(k.toLowerCase());
      }
    }
  }

  return tokens;
}

/**
 * Best-effort type inference from a manifest's dependency tokens. Falls back
 * to `library` when no signal matches — analyzer 01 will refine the type
 * later from graph evidence.
 */
function inferServiceType(deps: Set<string>): ServiceTypeToken {
  for (const tok of MOBILE_TOKENS) if (deps.has(tok)) return 'mobile';
  for (const tok of FRONTEND_FRAMEWORK_TOKENS) if (deps.has(tok)) return 'frontend';
  for (const tok of SERVERLESS_TOKENS) if (deps.has(tok)) return 'serverless';
  for (const tok of WORKER_TOKENS) if (deps.has(tok)) return 'worker';
  for (const tok of HTTP_FRAMEWORK_TOKENS) if (deps.has(tok)) return 'backend';
  for (const tok of CLI_TOKENS) if (deps.has(tok)) return 'cli';
  return 'library';
}

/**
 * Derive `(rawId, path)` for a single manifest. `path` is the project-relative
 * directory containing the manifest; `rawId` is the basename of that directory.
 * The root manifest yields `rawId = basename(projectPath)`.
 *
 * The raw id may collide across services that share a basename (e.g.
 * `firebase/functions` and `functions/` both yield `functions`). Resolution
 * happens later in `disambiguateIds`.
 */
function deriveServiceKey(
  manifestPath: string,
  projectPath: string,
): { rawId: string; path: string } {
  const dir = dirname(manifestPath);
  if (dir === '' || dir === '.' || dir === '/') {
    return { rawId: basename(projectPath) || 'root', path: '.' };
  }
  return { rawId: basename(dir), path: dir };
}

/**
 * Resolve service-id collisions deterministically by prefixing colliding ids
 * with their parent path segments until they're unique.
 *
 * Behaviour:
 *   - No collision: every service keeps its basename id.
 *   - Collision with a UNIQUE shallowest path: the shallowest service keeps
 *     the bare basename, the deeper services walk up their path one segment
 *     at a time until the prefix-prepended id is free.
 *   - Collision with no unique shallowest path (e.g. three siblings at the
 *     same depth): every colliding service walks up one segment, prefixing
 *     until everyone is unique.
 *
 * Examples (stride-origin):
 *   ['functions', 'firebase/functions']        → ['functions', 'firebase-functions']
 *   ['a/api', 'b/api', 'c/api']                → ['a-api', 'b-api', 'c-api']
 *
 * Stack-agnostic: walks the path one segment at a time; never appends a
 * language- or framework-specific suffix. The function is deterministic so
 * the seed is stable across runs.
 */
function disambiguateIds(
  entries: ReadonlyArray<{ rawId: string; path: string }>,
): Map<string, string> {
  const byRawId = new Map<string, string[]>();
  for (const e of entries) {
    const list = byRawId.get(e.rawId) ?? [];
    list.push(e.path);
    byRawId.set(e.rawId, list);
  }

  const resolved = new Map<string, string>();
  const used = new Set<string>();

  for (const [rawId, paths] of byRawId) {
    if (paths.length === 1) {
      let unique = rawId;
      let attempt = 0;
      while (used.has(unique)) {
        attempt++;
        unique = `${rawId}-${attempt}`;
      }
      resolved.set(paths[0], unique);
      used.add(unique);
      continue;
    }

    const withDepth = paths.map((p) => ({
      path: p,
      segments: p.split('/').filter((s) => s.length > 0 && !s.startsWith('@')),
    }));
    const minDepth = Math.min(...withDepth.map((w) => w.segments.length));
    const shallowest = withDepth.filter((w) => w.segments.length === minDepth);

    let bareWinnerPath: string | null = null;
    if (shallowest.length === 1 && minDepth <= 1 && !used.has(rawId)) {
      bareWinnerPath = shallowest[0].path;
      resolved.set(bareWinnerPath, rawId);
      used.add(rawId);
    } else {
      /*
       * Reserve the bare basename so the prefix walk below never claims it.
       * When no service has a uniquely shallow path (e.g. three siblings at
       * the same depth), nobody is entitled to the bare id — they all walk
       * up one segment and the resulting ids stay distinct.
       */
      used.add(rawId);
    }

    for (const { path, segments } of withDepth) {
      if (path === bareWinnerPath) continue;

      let id = rawId;
      let depth = 1;
      while (used.has(id) && depth < segments.length) {
        const prefix = segments[segments.length - 1 - depth];
        id = `${prefix}-${id}`;
        depth++;
      }
      let suffix = 1;
      while (used.has(id)) {
        id = `${rawId}-${suffix}`;
        suffix++;
      }
      resolved.set(path, id);
      used.add(id);
    }
  }

  return resolved;
}

/**
 * Build the seed list of authoritative services from a Phase 0 project
 * inspection.
 *
 * Stack-agnostic by construction: every per-language signal goes through the
 * language-config registry (`resolveManifestEntry`) and the heuristic
 * dependency-token sets above. Adding a new framework family is a one-line
 * append to the relevant token set — no schema or pipeline change required.
 *
 * Returns an empty array when `inspection` is absent or contains no
 * manifests; callers treat this as "no seed available — fall through to
 * the structure-analyzer-only path."
 */
export function buildServiceSeedFromInspection(
  inspection: ProjectInspection | undefined,
  projectPath: string,
): AuthoritativeService[] {
  if (!inspection) return [];
  const manifests = inspection.manifests ?? [];
  if (manifests.length === 0) return [];

  type SeedDraft = {
    rawId: string;
    path: string;
    manifest: ManifestEntry;
  };

  const seen = new Set<string>();
  const drafts: SeedDraft[] = [];

  for (const manifest of manifests as ManifestEntry[]) {
    const { rawId, path } = deriveServiceKey(manifest.path, projectPath);
    if (!rawId) continue;
    const dedupeKey = `${rawId}::${path}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    drafts.push({ rawId, path, manifest });
  }

  const idByPath = disambiguateIds(drafts.map((d) => ({ rawId: d.rawId, path: d.path })));

  return drafts.map((d) => {
    const langEntry = resolveManifestEntry(basename(d.manifest.path));
    const deps = collectDependencyTokens(d.manifest.raw);
    const type = inferServiceType(deps);
    return {
      id: idByPath.get(d.path) ?? d.rawId,
      path: d.path,
      type,
      language: langEntry?.languageKey,
    };
  });
}
