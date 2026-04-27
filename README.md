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

For full setup instructions, provider details, workflows, and guides see the [documentation site](https://thisisqubika.github.io/qubika-agentic-framework/).

---

## Support

- **Issues**: [GitHub Issues](https://github.com/thisisqubika/qubika-agentic-framework/issues)
- **Questions**: `#software-engineering-accelerate-ai` on Slack

---

## License

Internal use only. Not for external distribution.
