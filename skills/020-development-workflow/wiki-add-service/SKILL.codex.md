---
name: wiki-add-service
version: 1.0.0
last-updated: 2026-05-12
description: Create a new service-doc page under docs/llm-wiki/wiki/services/ for a service that exists in the project but has no wiki page yet. Use when /wiki-refresh surfaces a "potential new service detected" suggestion, or when the user says "/wiki-add-service <name>". Validates the service is real (cross-references framework-config.json::by_service or the project's directory structure) and refuses to create otherwise.
argument-hint: '<service-name>'
user-invokable: true
---

# Wiki Add Service (Codex)

Input: $ARGUMENTS

Create a new service-doc wiki page for `<service-name>`. **Service docs only**.

## Contract

- **Validates first.** The named service must exist (in `framework-config.json::by_service` or as a top-level directory with code). If not, abort.
- **Refuses duplicates.** If `docs/llm-wiki/wiki/services/<id>.md` already exists, abort.
- **One file in, one entry in index.md.** No other writes.

## Sequential phases

### 1. Parse the argument

Take `<service-name>` from `$ARGUMENTS`. If empty, emit `failed` with `Usage: /wiki-add-service <service-name>`. Trim whitespace; preserve casing.

### 2. Validate the service exists

Resolve `<service-name>` in this order:

1. Read `framework-config.json` and look in `stack_profile.by_service` keys / `stack_profile.services[].id` / `stack_profile.services[].name`.
2. Fallback: top-level directory at the project root, or under `services/` / `packages/`, containing code (any of `package.json`, `pyproject.toml`, `pom.xml`, `Cargo.toml`, `go.mod`, `*.csproj`, `Gemfile`, `composer.json`, `build.gradle*`, or non-empty `src/`).

If neither resolves, emit `failed` with: `No service matching '<service-name>' found in framework-config.json or in the project directory.`

Compute canonical `service_id` (lowercase, dashes for spaces / underscores).

### 3. Refuse duplicates

If `docs/llm-wiki/wiki/services/<service_id>.md` already exists, emit `failed` with: `Page docs/llm-wiki/wiki/services/<service_id>.md already exists. Use /wiki-refresh to update it.`

### 4. Gather context

- The service record from step 2.
- `mcp__code_graph__get_minimal_context_tool` for the service's entry-point symbols, using lean defaults (`detail_level: "minimal"`).
- `<service-path>/README.md` if present.
- Optionally `mcp__code_graph__get_community_tool` when a community is clearly identifiable.

### 5. Generate the page body

Use the standard service-doc sections:

```markdown
# <Service display name>

## Purpose
<one paragraph>

## Public API / Surface
<entry points, route bases, event topics — representative subset>

## Internal Architecture
<layered structure, middleware, DI, workers>

## Request Lifecycle (or Job Lifecycle)
<step-by-step>

## Data Layer
<persistence backends, namespaces>

## Integrations
<external services; cross-reference [[wikilinks]]>

## Service-Specific Patterns
<descriptive only, no prescriptive rules>
```

Use `(not determined by analysis)` inline where you can't ground a claim.

### 6. Write the file with frontmatter

Write `docs/llm-wiki/wiki/services/<service_id>.md`:

```yaml
---
document_type: service
summary: <one-line, <=160 chars>
last_updated: <ISO timestamp>
tags: [service, <language>, <type>, <framework-token>...]
related: [../ARCHITECTURE.md, ../SERVICES.md]
service_id: <service_id>
---
```

Tags from the service record (language, type, main framework family). Cap at 5.

### 7. Append index.md entry

Read `docs/llm-wiki/wiki/index.md`. Find the `## Per-service docs` section. Insert alphabetically:

```markdown
- [<service_id>](services/<service_id>.md) — *service* — <summary>. **Tags:** <tag>, <tag>. **Related:** [[ARCHITECTURE]], [[SERVICES]].
```

Surgical patch only.

### 8. Summary

Emit `completed`:

```
Created: docs/llm-wiki/wiki/services/<service_id>.md
Indexed: docs/llm-wiki/wiki/index.md (entry appended under "Per-service docs")

Next:
  - Review the generated page; surgical edits welcome before commit.
  - Commit with: docs(wiki): add service page for <service_id>
```

## Failure modes

- Empty argument → `failed` with `Usage: /wiki-add-service <service-name>`.
- Service does not exist → `failed`.
- Page already exists → `failed`.
- `index.md` missing → `failed` with `Wiki not initialized — run /initialize-project first.`
