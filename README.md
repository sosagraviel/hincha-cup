# Qubika Agentic Framework (QAF)

**AI-powered autonomous software development workflows — from idea to production-ready pull request with minimal human intervention.**

[![Production Ready](https://img.shields.io/badge/Status-Production%20Ready-brightgreen?style=for-the-badge)](.)
[![Stack Agnostic](https://img.shields.io/badge/Stack-Agnostic-blue?style=for-the-badge)](.)
[![Full SDLC](https://img.shields.io/badge/SDLC-Autonomous-orange?style=for-the-badge)](.)
[![Documentation](https://img.shields.io/badge/Docs-Website-purple?style=for-the-badge)](https://thisisqubika.github.io/qubika-agentic-framework/)

> 📖 **Full documentation at [thisisqubika.github.io/qubika-agentic-framework](https://thisisqubika.github.io/qubika-agentic-framework/)**

---

## What is this?

QAF orchestrates context gathering, planning, implementation, validation, and pull request creation across real codebases. It works with any tech stack and detects your project's conventions automatically.

---

## Quick Start

```bash
# 1. Setup (one-time)
git clone https://github.com/thisisqubika/qubika-agentic-framework.git
./qubika-agentic-framework/scripts/initialize-project.sh
# → writes .claude/ (Claude Code) or .codex/ (Codex CLI)
# → generates docs/llm-wiki/ — the LLM-owned knowledge base for this project

# 2. Create ticket from idea
# Claude Code — consults docs/llm-wiki/ before asking you questions
/create-sdd-ticket --from-input "Add dark mode toggle to settings page"
# Codex CLI
$create-sdd-ticket --from-input "Add dark mode toggle to settings page"

# 3. Implement ticket (13-phase workflow)
# Claude Code — Phase 8.5 auto-refreshes docs/llm-wiki/ before PR creation
/implement-ticket PROJ-456
# Codex CLI
$implement-ticket PROJ-456

# Result: Production-ready pull request with an up-to-date LLM wiki
```

The framework supports **Claude Code** (`/skill [args]`) and **Codex CLI** (`$skill [args]`, with `/skills` to list available skills). Initialize for either provider with `--provider claude|codex` (auto-detects from `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` when omitted).

If your repository vendors test fixtures or sample sub-projects that should not be analyzed as real services, add `--ignore <path>` — additive to `.gitignore` and accepts both forms: repeatable (`--ignore a --ignore b`) or comma-separated (`--ignore a,b,c`). Example: `./qubika-agentic-framework/scripts/initialize-project.sh --ignore test/integration/fixtures,docs/legacy`.

### LLM Wiki

`/initialize-project` generates `docs/llm-wiki/` — a structured, provenance-tracked knowledge base that agents consult instead of re-grepping the codebase on every ticket. Keep it current with:

```bash
# Check wiki health
# Claude Code
/wiki-lint
# Codex CLI
$wiki-lint

# Refresh after a large refactor
# Claude Code
/wiki-refresh --since <sha>
# Codex CLI
$wiki-refresh --since <sha>
```

`/implement-ticket` refreshes the wiki automatically (Phase 8.5) — manual `/wiki-refresh` is only needed after out-of-band changes.

### Architecture highlights

**Deterministic-first composer.** `/initialize-project` is engineered so the LLM is a *composer*, not an investigator. Phase 0 walks the project deterministically (manifests, lock files, runtime pins); Phase 1 analyzers enrich it with citation-required judgment — including grounded, per-service `file_placement_patterns` (real `type → location → example` rows observed on disk) that seed the CLAUDE.md File Placement Guide instead of generic framework conventions; Phase 2 builds four pre-flattened "composer views" with provenance tags (`slice → analyzer → deterministic → absent`); Phase 3's closed-book synthesizer reads those views verbatim. Empty sections only appear when the project genuinely lacks the evidence — never because the LLM forgot.

**Open-book verification (Phase 3.5).** After the closed-book synthesizer writes the cheat-sheet, a dedicated, open-book verifier node (`Read`/`Glob`/`Grep`) audits every claim in the generated `CLAUDE.md`/`AGENTS.md` against the real repository: it fixes or removes broken file-placement rows, directory-tree entries, and inline paths, and collapses duplicate/garbage Services & Ports rows (e.g. a docker-compose alias that shadows the real source service). The step is best-effort and non-blocking — if it cannot run or repair, the original synthesis is kept and initialization proceeds.

**Service-completeness contract.** The structure analyzer is the single source of truth for service discovery. A Stop-hook validator globs the project tree against every manifest pattern in the language registry (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `AndroidManifest.xml`, `Package.swift`, `*.xcodeproj`, etc.) and rejects analyzer outputs that miss a manifest-bearing directory — unless the agent explicitly explains the omission via `needs_verification`. Mobile apps and other "exotic" services in a monorepo can never be silently dropped.

For full setup instructions, provider details, workflows, and guides see the [documentation site](https://thisisqubika.github.io/qubika-agentic-framework/).

---

## MCP integrations

QAF skills can route user-input prompts through an MCP tool instead of console, enabling web UI, Slack, and ticketing backends to receive structured question batches.

**Opt-in**: set `QAF_ASK_USER_MCP_TOOL=mcp__qaf__ask_user_questions` in your shell environment.

**Payload contract**: documented in [`docs/mcp-user-questions/README.md`](./docs/mcp-user-questions/README.md)

**Integration plan**: documented in [`docs/mcp-user-questions/README.md`](./docs/mcp-user-questions/README.md)

**Hook scripts**: shipped under [`docs/mcp-user-questions/`](./docs/mcp-user-questions/). `/initialize-project` does **not** auto-install them. To enable the MCP path, follow the manual install steps in [`docs/mcp-user-questions/README.md`](./docs/mcp-user-questions/README.md): copy both scripts into your project, substitute the framework-version placeholder, register the `SessionStart` hook in `.claude/settings.json`, and `chmod +x` the result.

**Requirement**: `jq` must be installed on the developer machine when this env var is set. Without `jq`, the payload builder exits with an actionable error.

- macOS: `brew install jq`
- Ubuntu/Debian: `sudo apt-get install jq`

When `QAF_ASK_USER_MCP_TOOL` is unset, all skill behavior is identical to the console-only default — no hooks are required and no session file is read.

---

## Support

- **Issues**: [GitHub Issues](https://github.com/thisisqubika/qubika-agentic-framework/issues)
- **Questions**: `#software-engineering-accelerate-ai` on Slack





GRITO GOL - quick start
1 - npm run emulators
2 - npm run seed:emulator
3 - npm run dev

---

## License

Internal use only. Not for external distribution.
