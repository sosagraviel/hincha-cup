/**
 * Project-inspection schema.
 *
 * The project-inspection helper runs in Phase 0 BEFORE any LLM call.
 * It walks the project filesystem and produces deterministic, parsed
 * data the Phase-1 analyzers consume instead of re-deriving via LLM.
 *
 * Stack-agnostic by construction:
 *   - All maps are string-keyed (no closed enums for languages /
 *     managers / frameworks / patterns).
 *   - Lookup tables (`runtime-version-table.ts`, `lock-file-table.ts`,
 *     `manifest-parser-table.ts`) hold the canonical-filename mappings.
 *     Adding a new language family is a one-line PR per table — no
 *     schema change needed.
 *   - Every top-level field except `generated_at` / `schema_version` /
 *     `repository_type` is OPTIONAL. A project that doesn't ship a
 *     CI config, IaC files, .env templates, etc. simply yields no
 *     entry — the schema accepts the absence without complaint.
 *
 * Naming-agnostic: we DO NOT enumerate role names (Controller /
 * Service / Repository / etc.) anywhere here. We carry the project's
 * filenames verbatim.
 */

import { z } from 'zod';

const ManifestEntrySchema = z
  .object({
    /**
     * Canonical-filename label of the manifest, free-form string
     * (e.g. `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`,
     * `pom.xml`, `Gemfile`, `composer.json`, `*.csproj`, `mix.exs`,
     * `pubspec.yaml`, `shard.yml`, `gleam.toml`, `dune-project`,
     * `cabal.project`, `rebar.config`, `Package.swift`, etc.). Adding
     * a new manifest kind is a one-line addition to
     * `manifest-parser-table.ts`.
     */
    kind: z.string().min(1),
    /** Path relative to the project root. */
    path: z.string().min(1),
    /**
     * The parsed manifest as a JSON-serialisable object. The parser
     * preserves the project's own keys verbatim — no field-name
     * normalisation here. Analyzers see `dependencies` /
     * `[dependencies]` / `<dependencies>` / `require` / etc. exactly
     * as the project wrote them.
     */
    raw: z.unknown(),
  })
  .strict();

const LockFileEntrySchema = z
  .object({
    /** Path relative to the project root. */
    path: z.string().min(1),
    /**
     * Free-form manager identifier (`pnpm`, `yarn`, `npm`, `bun`,
     * `poetry`, `pipenv`, `uv`, `cargo`, `go-modules`, `bundler`,
     * `composer`, `mix`, `pub`, `nuget`, `berkshelf`, `deno`,
     * `shards`, `gleam`, `stack`, `cabal`, `opam`, …). Comes
     * verbatim from `lock-file-table.ts`.
     */
    manager: z.string().min(1),
  })
  .strict();

export const ProjectInspectionSchema = z
  .object({
    /** ISO 8601 timestamp the inspection was generated. */
    generated_at: z.string(),
    /** Bumps when the on-disk shape changes incompatibly. */
    schema_version: z.literal(1),

    /**
     * Repository topology (best-effort heuristic from workspace-config
     * presence + manifest count). `unknown` when the inspector can't
     * decide — analyzers fall back to LLM-based discovery.
     */
    repository_type: z.enum(['monorepo', 'polyrepo', 'single-service', 'unknown']),

    /**
     * Monorepo metadata, present only when a workspace tool is detected.
     * Every sub-field is independently optional — a `pnpm-workspace.yaml`
     * yields `package_manager: 'pnpm'` and `workspace_tool: 'pnpm
     * workspaces'`; a Cargo workspace yields `package_manager: 'cargo'`
     * and `workspace_tool: 'cargo workspaces'`; etc.
     */
    monorepo: z
      .object({
        package_manager: z.string().optional(),
        workspace_tool: z.string().optional(),
        workspace_config: z.string().optional(),
        workspace_paths: z.array(z.string()).optional(),
      })
      .strict()
      .optional(),

    /**
     * Free-form `Record<language_key, version>` map. Keys come from
     * `runtime-version-table.ts` (`node` / `python` / `go` / `rust` /
     * `ruby` / `php` / `dotnet` / `java` / `kotlin` / `scala` / `swift`
     * / `dart` / `erlang` / `elixir` / `crystal` / `nim` / `zig` /
     * `gleam` / `haskell` / `ocaml` / etc.). A language family the
     * table doesn't know about yields no entry — analyzers fall
     * through to LLM-based version discovery for those services.
     */
    runtime_versions: z.record(z.string(), z.string()),

    /**
     * Lock files discovered anywhere in the project tree (excluding
     * the framework's standard ignore-dirs). Used by analyzers to
     * confirm which package manager each service uses without
     * re-deriving from manifests.
     */
    lock_files: z.array(LockFileEntrySchema),

    /**
     * Manifests discovered AND PARSED. The parser table determines
     * which formats are recognised; an unknown manifest is silently
     * skipped (analyzers fall through to LLM-based parsing for it).
     */
    manifests: z.array(ManifestEntrySchema),

    /**
     * Concrete infrastructure tool names detected from filesystem
     * evidence. Free-form strings — the analyzer surfaces whatever the
     * inspector found (`docker` / `docker-compose` / `kubernetes` /
     * `helm` / `terraform` / `pulumi` / `serverless` / `sam` /
     * `netlify` / `vercel` / `ansible` / `nginx` / etc.). Empty array
     * when no infrastructure is detected.
     */
    infrastructure: z.array(z.string()),

    /**
     * CI/CD provider detected from canonical config-file presence.
     * Absent when no CI config is found.
     */
    ci_cd: z
      .object({
        provider: z.string().optional(),
        config_files: z.array(z.string()),
      })
      .strict()
      .optional(),

    /**
     * Environment variable names extracted from `.env.example` /
     * `.env.sample` / `.env.template` (and per-service equivalents).
     * Variable values are NEVER read.
     */
    environment: z
      .object({
        required_vars: z.array(z.string()),
        template_files: z.array(z.string()),
      })
      .strict()
      .optional(),

    /**
     * Documentation paths the project ships. Helps the tech-stack
     * analyzer locate README sections without re-globbing.
     */
    documentation: z
      .object({
        readme_paths: z.array(z.string()),
        contributing_paths: z.array(z.string()),
        docs_dirs: z.array(z.string()),
      })
      .strict()
      .optional(),

    /**
     * Heuristic port-candidate list per service-path candidate. Keys
     * are project-relative paths (the inspector doesn't know service
     * IDs yet — those come from the structure analyzer); values are
     * sorted unique port numbers extracted from compose / k8s / .env
     * / config files. Empty map when nothing is found.
     */
    port_candidates: z.record(z.string(), z.array(z.number())),

    /**
     * Infrastructure-services hints with named service → port mappings.
     * Parsed from docker-compose service
     * blocks + firebase.json emulators when present; empty array
     * otherwise. The data-flows analyzer treats these as PRESUMPTIVE
     * authority — emit them verbatim into
     * `findings.infrastructure_services[]` unless the service is
     * better described as SaaS (per the standard opt-out shape).
     *
     * `name` is the raw service identifier from the source file
     * (`postgres`, `redis`, `keycloak`, `mailhog`, `firestore`, …)
     * preserved verbatim; the analyzer maps to wiki-canonical labels.
     * `port` is the HOST-side port the operator hits. `source_file`
     * is the inspection source path relative to the project root.
     */
    infrastructure_services_hints: z
      .array(
        z
          .object({
            name: z.string().min(1),
            port: z.number().int().positive(),
            source_file: z.string().min(1),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export type ProjectInspection = z.infer<typeof ProjectInspectionSchema>;
export type ManifestEntry = z.infer<typeof ManifestEntrySchema>;
export type LockFileEntry = z.infer<typeof LockFileEntrySchema>;

export const PROJECT_INSPECTION_FILENAME = 'project-inspection.json';
