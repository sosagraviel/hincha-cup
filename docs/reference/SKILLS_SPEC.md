# Skills Specification

**Purpose**: Canonical contract for authoring, validating, and generating `SKILL.md` files within this framework.

**Audience**: Framework developers, AI agent designers, and AI agents that generate or consume skills.

**Version**: 1.0.0
**Last Updated**: 2026-03-23

---

## Table of Contents

1. [Terminology](#terminology)
2. [Skill File Structure](#skill-file-structure)
3. [YAML Frontmatter Schema](#yaml-frontmatter-schema)
4. [String Substitutions](#string-substitutions)
5. [Skill Archetypes](#skill-archetypes)
6. [Markdown Body Guidelines](#markdown-body-guidelines)
7. [Tool Declaration Patterns](#tool-declaration-patterns)
8. [Invocation Control](#invocation-control)
9. [Registration in skills.config.json](#registration-in-skillsconfigjson) *(see [ADDING_SKILLS.md](ADDING_SKILLS.md))*
10. [Validation Rules](#validation-rules)
11. [Anti-Patterns](#anti-patterns)
12. [Example Templates](#example-templates)
13. [Related Documents](#related-documents)
14. [Changelog](#changelog)

---

## Terminology

| Term | Definition |
|------|------------|
| **Skill** | A self-contained unit of knowledge or workflow defined in a `SKILL.md` file. Skills contain instructions, domain expertise, and best practices that Claude follows when the skill is invoked. |
| **Archetype** | One of two recognized skill categories: **Workflow** (executable process with phases) or **Reference** (domain knowledge for code generation). |
| **Frontmatter** | YAML metadata between `---` delimiters at the top of a `SKILL.md` file. Configures skill behavior, discovery, and invocation. |
| **Trigger** | A string matched against the detected tech stack during project initialization. When a trigger matches, the skill is copied to the target project. |
| **User-invocable** | A skill that appears in the `/` slash-command menu for direct user invocation. Default: `true`. |
| **Model-invocable** | A skill whose description is loaded into Claude's context, allowing Claude to invoke it automatically when relevant. Disabled by setting `disable-model-invocation: true`. |
| **Always-copy** | A skill that is copied to every project regardless of stack detection results. |
| **Supporting files** | Additional files in a skill directory (templates, examples, scripts) referenced from `SKILL.md`. |

---

## Skill File Structure

### Directory Layout

Every skill resides in a category group under the `skills/` directory, following the Johnny Decimal numbering system:

```
skills/{NNN-category-name}/{skill-name}/
├── SKILL.md              # Main skill file (required)
├── templates/            # Optional: templates for Claude to fill in
├── examples/             # Optional: example outputs showing expected format
├── references/           # Optional: detailed reference material
├── guides/               # Optional: supplementary guides
└── scripts/              # Optional: scripts Claude can execute
```

### Category Groups

| Group | Name | Purpose |
|-------|------|---------|
| 010 | Foundation | Project initialization, context |
| 020 | Development Workflow | Ticket creation, implementation, requirements |
| 030 | Quality Assurance | Code quality, security, PR creation, testing |
| 040 | Integrations | Jira, GitHub, Confluence, Notion |
| 050 | Language & Frameworks | TypeScript, React, Python, Go, etc. |
| 060 | Documentation | Design docs, diagrams |
| 070 | Infrastructure | Docker, container patterns |
| 080 | Cloud Platforms | AWS, GCP, Firebase |

### Requirements

- The `SKILL.md` file is **required** and must begin with YAML frontmatter delimiters (`---`).
- The skill directory name must match the `name` field in the frontmatter (or the `name` defaults to the directory name if omitted).
- Every skill must be registered in `skills/skills.config.json` (see [Registration](#registration-in-skillsconfigjson)).

---

## YAML Frontmatter Schema

Frontmatter is YAML between `---` markers at the top of `SKILL.md`. Fields are divided into **official Claude Code fields** (from the [Claude Code skills standard](https://code.claude.com/docs/en/skills)) and **framework-specific extensions**.

### Official Claude Code Fields

These fields are defined by the Claude Code platform and control skill behavior at runtime.

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `name` | No | `string` | Directory name | Display name and slash-command identifier. Lowercase letters, numbers, and hyphens only. Max 64 characters. |
| `description` | Recommended | `string` or multiline | First paragraph of content | What the skill does and when to use it. Claude uses this for auto-discovery. Include "Use when..." phrases. |
| `argument-hint` | No | `string` | — | Hint shown during autocomplete. Example: `[issue-number]`, `[--from-context <path>]`. |
| `disable-model-invocation` | No | `boolean` | `false` | When `true`, prevents Claude from auto-loading this skill. Use for workflows with side effects. |
| `user-invocable` | No | `boolean` | `true` | When `false`, hides from the `/` menu. Use for background knowledge skills. |
| `allowed-tools` | No | `string` (comma-separated) or `array` | — | Tools Claude can use without asking permission when this skill is active. Alias: `tools` (both accepted; `allowed-tools` is the official name). See [Tool Declaration Patterns](#tool-declaration-patterns). |
| `model` | No | `string` | Session default | Model to use when skill is active (e.g., `sonnet`, `opus`, `haiku`). |
| `effort` | No | `string` | Session default | Effort level: `low`, `medium`, `high`, `max`. |
| `context` | No | `string` | — | Set to `fork` to run in a forked subagent context. |
| `agent` | No | `string` | `general-purpose` | Subagent type when `context: fork`. Options: `Explore`, `Plan`, `general-purpose`, or any custom agent from `.claude/agents/`. |
| `hooks` | No | `object` | — | Hooks scoped to this skill's lifecycle. See [Claude Code hooks documentation](https://code.claude.com/docs/en/hooks#hooks-in-skills-and-agents). |

### Framework-Specific Extensions

These fields are specific to this framework and support stack detection, categorization, and discovery.

| Field | Required | Type | Default | Description |
|-------|----------|------|---------|-------------|
| `version` | Recommended | `string` | — | Semantic version (e.g., `1.0.0`, `2.1.0`). Increment on meaningful changes. |
| `category` | Recommended | `string` | — | Semantic category in kebab-case. Examples: `development-workflow`, `programming-languages`, `cloud-infrastructure`, `quality-assurance`. |
| `triggers` | Recommended | `array of strings` | — | Stack detection triggers. Matched against the detected tech stack during `initialize-project`. Examples: `[typescript, ts]`, `[react, nextjs]`, `[docker, dockerfile]`. |
| `keywords` | Optional | `array of strings` | — | Discovery keywords for search and catalog generation. Distinct from triggers. |
| `prerequisites` | Optional | `array of strings` | — | Required skills or tools. Supports annotations: `jira (optional, only for --from-jira)`. |
| `tags` | Optional | `array of strings` | — | Classification tags for catalog generation. Lowercase, kebab-case. |
| `author` | Optional | `string` | — | Skill author or team name. |
| `license` | Optional | `string` | — | SPDX license identifier (e.g., `MIT`, `Apache-2.0`). |
| `last_updated` | Optional | `string` | — | ISO date format: `YYYY-MM-DD`. |
| `stacks` | Optional | `array of strings` | — | Compatible stacks. Use `[all]` for stack-agnostic skills. |
| `always_copy` | Optional | `boolean` | `false` | When `true`, skill is copied to every project regardless of stack detection. |
| `detection` | Optional | `object` | — | File-based detection: `{ files: string[], patterns: string[] }`. |
| `metadata` | Optional | `object` | — | **Legacy.** Wrapper for `version`, `category`, `triggers`. Top-level fields take precedence. New skills must use top-level fields. |

### Field Placement Rule

When a field appears both at the top level and inside `metadata`, the **top-level value takes precedence**. New skills must place all fields at the top level. The `metadata` wrapper is supported only for backward compatibility with existing skills.

---

## String Substitutions

Skills support dynamic value substitution in the markdown content. These are processed before Claude receives the skill content.

### Argument Placeholders

| Variable | Description |
|----------|-------------|
| `$ARGUMENTS` | All arguments passed when invoking the skill. If not present in content, arguments are appended as `ARGUMENTS: <value>`. |
| `$ARGUMENTS[N]` | Access a specific argument by 0-based index (e.g., `$ARGUMENTS[0]` for the first). |
| `$N` | Shorthand for `$ARGUMENTS[N]` (e.g., `$0`, `$1`). |

### Environment Variables

| Variable | Description |
|----------|-------------|
| `${CLAUDE_SESSION_ID}` | Current session ID. Useful for logging or session-specific files. |
| `${CLAUDE_SKILL_DIR}` | Directory containing the skill's `SKILL.md`. Use to reference bundled scripts or files. |

### Dynamic Context Injection

The `` !`<command>` `` syntax runs a shell command before the skill content is sent to Claude. The command output replaces the placeholder:

```yaml
---
name: pr-summary
description: Summarize changes in a pull request
context: fork
agent: Explore
---

## Pull request context
- PR diff: !`gh pr diff`
- Changed files: !`gh pr diff --name-only`

Summarize this pull request...
```

---

## Skill Archetypes

### Archetype A: Workflow/Orchestration

Skills that define an executable process with numbered phases. Used for task automation, code generation pipelines, and multi-step workflows.

**Examples**: `create-sdd-ticket`, `code-implementation`, `create-pr`, `analyze-requirements`, `security-review`.

#### Required Markdown Sections

1. **Title** — Single `#` heading with a one-line purpose statement beneath it.
2. **Usage / Quick Start** — How to invoke the skill with example commands.
3. **Workflow** — Numbered phases. Each phase must include:
   - Phase name and number
   - **Actions**: What the phase does (numbered steps)
   - **Tools**: What tools or APIs are used (with code examples)
   - **Output**: What the phase produces
4. **Error Handling** — Failure modes and recovery strategies for each phase.

#### Recommended Markdown Sections

5. **Table of Contents** — For skills longer than 100 lines.
6. **Overview** — High-level summary of the skill's approach.
7. **When to Use** — Activation conditions and contraindications.
8. **Input/Output Modes** — If the skill supports multiple input sources or output formats.
9. **Integration with Other Skills** — How this skill invokes or is invoked by other skills.
10. **Output Format** — Structured output schema (JSON or markdown) with examples.
11. **Best Practices** — Do/don't guidance.
12. **Examples** — Concrete invocation examples with expected outcomes.

### Archetype B: Reference/Mastery

Skills that provide domain knowledge for AI agents to use during code generation. These are knowledge bases, not executable workflows.

**Examples**: `mastering-typescript`, `react-frontend`, `mastering-aws-cli`, `developing-with-docker`, `pytest-patterns`.

#### Required Markdown Sections

1. **Title** — Single `#` heading with a compatibility/version note (e.g., "TypeScript 5.9+, Node.js 22 LTS").
2. **Quick Start** — Minimal working example that demonstrates the core concept.
3. **Core Concepts** — At least one substantive section covering the domain.

#### Recommended Markdown Sections

4. **When to Use** — Activation conditions.
5. **Topic Sections** — Deep-dive sections organized by concept area.
6. **Code Examples** — Practical, copy-pasteable code blocks with language tags.
7. **Common Patterns / Anti-Patterns** — Correct vs. incorrect approaches with rationale.
8. **Decision Trees** — When to choose approach A vs. B (ASCII tree format).
9. **Troubleshooting** — Common errors and their fixes.
10. **References** — Links to official documentation, specs, or related skills.

---

## Markdown Body Guidelines

These rules apply to both archetypes:

- **Headings**: Use ATX-style (`#`, `##`, `###`). Exactly one `#` (H1) per file.
- **Code blocks**: Always specify a language tag (` ```bash `, ` ```typescript `, ` ```json `, etc.). No bare ` ``` ` blocks.
- **Cross-references**: Reference other skills using the slash-command form: `/skill-name`.
- **File size**: Keep `SKILL.md` under **500 lines**. Move detailed reference material, API docs, or extensive examples to [supporting files](#skill-file-structure).
- **Emoji**: Acceptable in body text for status indicators (`✅`, `❌`, `⚠️`). Avoid emoji in headings.
- **Tables**: Use standard GitHub-flavored Markdown pipe syntax for comparisons and references.
- **Lists**: Use numbered lists (`1.`) for sequential steps, unordered lists (`-`) for non-sequential items.

---

## Tool Declaration Patterns

The `allowed-tools` field supports several declaration forms:

### Exact Tool Names

Standard Claude Code tools:

```yaml
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Edit
  - Skill
  - WebFetch
```

### Scoped Bash Commands

Restrict Bash to specific command patterns:

```yaml
allowed-tools:
  - Bash(python *)
  - Bash(gh *)
  - Bash(npm test)
```

### MCP Tool Wildcards

Match all tools from an MCP server:

```yaml
allowed-tools:
  - mcp__atlassian__*
  - mcp__github__*
```

### MCP Specific Tools

Reference a single MCP tool:

```yaml
allowed-tools:
  - mcp__atlassian__jira_create_issue
  - mcp__atlassian__jira_get_issue
```

### Comma-Separated (Inline)

For short lists, use comma-separated format:

```yaml
allowed-tools: Read, Grep, Glob
```

---

## Invocation Control

Two frontmatter fields control who can invoke a skill and how it appears in context:

| Configuration | User can invoke | Claude can invoke | Context loading |
|---|---|---|---|
| *(defaults)* | Yes | Yes | Description always in context; full content loads on invocation |
| `disable-model-invocation: true` | Yes | No | Description not in context; full content loads when user invokes |
| `user-invocable: false` | No | Yes | Description always in context; full content loads when Claude invokes |

### Guidelines

- **Workflow skills with side effects** (deploy, commit, send-to-jira): Use `disable-model-invocation: true` so users control timing.
- **Background knowledge skills** (legacy-system-context, internal-conventions): Use `user-invocable: false` so Claude loads them when relevant but they don't clutter the `/` menu.
- **Avoid combining** `user-invocable: false` with `disable-model-invocation: true` — this makes the skill unreachable.

---

## Registration in skills.config.json

Every skill must be registered in `skills/skills.config.json`. For the full registration procedure, config structure, and examples, see [ADDING_SKILLS.md](ADDING_SKILLS.md).

The frontmatter and config entry must stay in sync: the config is the source of truth for the skill discovery pipeline; the frontmatter is the source of truth for Claude Code runtime behavior.

---

## Validation Rules

The following rules define a valid `SKILL.md`. A future CI validator can enforce these programmatically.

### Required

1. File begins with `---` (YAML frontmatter delimiter).
2. `name` (if present) matches the regex `^[a-z][a-z0-9-]*$` and is at most 64 characters.
3. `name` (if present) matches the containing directory name.
4. The skill is registered in `skills/skills.config.json` with a matching `name`.

### Recommended

5. `description` is present and between 20–500 characters.
6. `description` includes a "Use when..." phrase for AI discovery.
7. `version` (if present) matches semver: `^\d+\.\d+\.\d+$`.
8. `triggers` (if present) is a non-empty array of lowercase strings.

### Conditional

9. If `user-invocable` is not `false` and skill is a workflow type, `argument-hint` should be present.
10. If `context` is `fork`, `agent` should be specified.
11. `user-invocable: false` and `disable-model-invocation: true` must not both be set (skill becomes unreachable).

### Structural

12. The markdown body contains exactly one `#` (H1) heading.
13. All code blocks specify a language tag.
14. Workflow skills contain a numbered workflow section.
15. Reference skills contain a Quick Start and at least one Core Concepts section.

---

## Anti-Patterns

### 1. Name/Directory Mismatch

```yaml
# BAD — skill in directory "mastering-go-skill/"
name: mastering-go
```

```yaml
# GOOD
name: mastering-go-skill
```

### 2. Using `metadata` Wrapper for New Skills

```yaml
# BAD — legacy pattern
metadata:
  version: 1.0.0
  category: programming-languages
  triggers: [go, golang]
```

```yaml
# GOOD — top-level fields
version: 1.0.0
category: programming-languages
triggers: [go, golang]
```

### 3. Weak Descriptions

```yaml
# BAD — too short, no context for AI discovery
description: TypeScript patterns
```

```yaml
# GOOD — includes "Use when" context
description: >
  Enterprise-grade TypeScript development patterns for type-safe applications.
  Use when building TypeScript projects, migrating from JavaScript, or
  implementing advanced type patterns with generics and conditional types.
```

### 4. Listing Unused Tools

Only declare tools the skill actually uses. Overly broad tool lists grant unnecessary permissions.

### 5. Missing Config Registration

A skill without a `skills.config.json` entry will not be discovered or copied during project initialization.

### 6. Hardcoded Credentials or URLs

```yaml
# BAD
allowed-tools:
  - mcp__atlassian__jira_create_issue
# ...then in content: "Create issue at https://company.atlassian.net/..."
```

Use environment variables or MCP configuration for project-specific values.

### 7. Mixing Archetypes

A skill should clearly be either Workflow or Reference. If a skill needs both an executable process and deep domain knowledge, split into two skills and cross-reference them.

### 8. Oversized SKILL.md

Keep `SKILL.md` under 500 lines. Move detailed API docs, extensive code examples, or reference material to supporting files in the skill directory.

---

## Example Templates

Copy-pasteable starter templates for each archetype. Copy the file, rename it to `SKILL.md`, and fill in the placeholders.

| Archetype | Template |
|-----------|----------|
| Workflow/Orchestration | [SKILL_TEMPLATE_WORKFLOW.md](templates/SKILL_TEMPLATE_WORKFLOW.md) |
| Reference/Mastery | [SKILL_TEMPLATE_REFERENCE.md](templates/SKILL_TEMPLATE_REFERENCE.md) |

For real-world examples, see:
- **Workflow**: [create-sdd-ticket/SKILL.md](../skills/020-development-workflow/create-sdd-ticket/SKILL.md)
- **Reference**: [mastering-typescript/SKILL.md](../skills/050-language-frameworks/mastering-typescript/SKILL.md)

---

## Related Documents

| Document | Purpose | Relationship |
|----------|---------|--------------|
| [ADDING_SKILLS.md](ADDING_SKILLS.md) | Procedural "how to add a skill" guide | Points to this spec for the full schema |
| [SKILLS_AND_AGENTS_MAP.md](../SKILLS_AND_AGENTS_MAP.md) | Skill-first architecture overview | This spec is the authoring standard |
| [SKILL_CATALOG.md](../SKILL_CATALOG.md) | Auto-generated skill catalog | This spec defines what makes a valid entry |
| [skills.config.json](../skills/skills.config.json) | Runtime skill registry | Must stay in sync with frontmatter |
| [Claude Code Skills Docs](https://code.claude.com/docs/en/skills) | Official Claude Code skills standard | This spec extends the official standard |

---

## Changelog

| Version | Date | Description |
|---------|------|-------------|
| 1.0.0 | 2026-03-23 | Initial specification |
