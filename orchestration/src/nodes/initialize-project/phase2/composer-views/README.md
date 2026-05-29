# Composer views

This directory builds the four JSON files Phase 3's closed-book synthesizer reads. Each file is the **deterministic seam** between Phase 1 (LLM analyzers) and Phase 3 (LLM synthesizer): the synthesizer cannot Read / Grep / Glob / call MCP, so somebody has to flatten Phase 1's free-form analyzer outputs into a shape the synthesizer's prompt can consume. That somebody is `build-composer-views.ts`.

## The four views

| File (in `<tempDir>/composer-views/`) | Feeds which final artefact                          |
| ------------------------------------- | --------------------------------------------------- |
| `code-conventions.input.json`         | `.claude/skills/code-conventions/SKILL.md`          |
| `multi-file-workflows.input.json`     | `.claude/skills/multi-file-workflows/SKILL.md`      |
| `testing-conventions.input.json`      | `.claude/skills/testing-conventions/SKILL.md`       |
| `architecture-narrative.input.json`   | Architectural-narrative section in CLAUDE.md / wiki |

Each view also has a `present.<sub>: boolean` flag block. `present.<sub>: false` means the composer found no data for that sub-section and the synthesizer must skip it. The bundle index (`_bundle.json`) lists every view's flags so the orchestrator can warn early when something is missing.

## The fallback chain

For every field in a composer view, the builder reads sources in this priority order:

```
1. Phase 1.5 service-detail slice         (currently deleted; layer reserved for future per-service mini-agents)
2. Phase 1 analyzer JSON                  (LLM enrichment, when the agent emitted the field)
3. Deterministic derivation               (from project-inspection + manifests + the language-config registry)
4. Empty / present: false                  (only when the project genuinely lacks the evidence)
```

The deterministic-derivation layer (`orchestration/src/services/framework/composer-derivation/`) is the load-bearing fix: it guarantees that a composer view's sub-section is `present: true` whenever the source files exist on disk, even if Haiku skips every optional LLM-judgment field. Today most empty composer sections come from "Haiku didn't fill an optional field"; after the derivation layer, an empty sub-section means "the target project genuinely doesn't have this kind of evidence."

Each composer-view sub-section also carries a `present.<sub>_source: 'slice'|'analyzer'|'deterministic'|'absent'` provenance tag so the run report can tell you where every piece of data came from.

## Field source matrix

Every field in every composer view, classified by source:

- **Det** — computable from inspection + manifests + registry. Always present when source files exist.
- **LLM-judgment (cited)** — needs an LLM reading code; the schema requires `source_file` + `source_line` citations and rejects un-cited entries.
- **LLM-narrative** — needs LLM prose; must be grounded in the Det facts already in the view.
- **Hybrid** — Det baseline that LLM-narrative may overwrite if it has something richer.

### architecture-narrative

| Field                                                                                                | Type                  |
| ---------------------------------------------------------------------------------------------------- | --------------------- |
| `repository_shape_summary`                                                                           | Hybrid                |
| `monorepo_layout`                                                                                    | Det                   |
| `languages[]`                                                                                        | Det                   |
| `runtimes`                                                                                           | Det                   |
| `external_services[]`                                                                                | Det                   |
| `architecture.coupling.{hubs,bridges}`                                                               | Det (from code graph) |
| `architecture_decisions[]`                                                                           | LLM-judgment (cited)  |
| `automation.{makefiles,justfiles,taskfiles,shell_scripts,devcontainer,ci_hints,readme_run_sections}` | Det                   |
| `by_service.<svc>.notable[]`                                                                         | LLM-judgment (cited)  |

### testing-conventions

| Field                                                  | Type                 |
| ------------------------------------------------------ | -------------------- |
| `project_level.runners[]`                              | Det                  |
| `project_level.summary`                                | Hybrid               |
| `by_service.<svc>.unit.framework`                      | Det                  |
| `by_service.<svc>.{unit,integration,e2e}.config_file`  | Det                  |
| `by_service.<svc>.{unit,integration,e2e}.file_pattern` | Det                  |
| `by_service.<svc>.representative_examples[]`           | LLM-judgment (cited) |
| `by_service.<svc>.notes`                               | LLM-narrative        |

### code-conventions

| Field                                                      | Type                 |
| ---------------------------------------------------------- | -------------------- |
| `quality_tools.{linter,formatter,type_checker,pre_commit}` | Det                  |
| `quality_tools.enforcement_summary`                        | Hybrid               |
| `by_service.<svc>.code_patterns[]`                         | LLM-judgment (cited) |
| `by_service.<svc>.notable[]`                               | LLM-judgment (cited) |

### multi-file-workflows

| Field                                  | Type                 |
| -------------------------------------- | -------------------- |
| `auth_flow.libraries[]`                | Det                  |
| `auth_flow.strategy`                   | Det                  |
| `auth_flow.summary`                    | Hybrid               |
| `auth_flow.examples[]`                 | LLM-judgment (cited) |
| `event_pipeline.{pattern,technology}`  | Det                  |
| `event_pipeline.examples[]`            | LLM-judgment (cited) |
| `by_service.<svc>.request_lifecycle[]` | LLM-judgment (cited) |

## Why keep the composer at all?

It would be tempting to skip the composer and pass the analyzer JSONs directly to the synthesizer. Two reasons not to:

1. **The synthesizer is closed-book.** It cannot navigate across analyzer files; it composes from whatever shape the prompt hands it. The composer is where that shape gets built.
2. **Decoupling.** Phase 1 analyzer schemas can evolve without breaking the synthesizer prompt; the composer absorbs the change. Conversely, the synthesizer can change its output sections without forcing every analyzer to re-shape its JSON.

The composer is small (one file, four `build*View` functions). Its job is precisely "flatten Phase 1 + deterministic sources into the synthesizer's input contract" — nothing more.

## Adding a new sub-section

1. Add the field to the relevant `*ViewSchema` in `schemas.ts`. Include the `present.<sub>` flag and the `present.<sub>_source` tag.
2. Update the matching `build*View(...)` function to read in priority order: slice → analyzer JSON → deterministic derivation.
3. If the field is deterministically computable, add a function to `services/framework/composer-derivation/` and wire it as the fallback source.
4. If the field is LLM-judgment, add it to the relevant Phase 1 analyzer schema with citation requirements (`source_file` + `source_line` required) and the `<<script:schema-skeleton>>` token in the analyzer prompt picks it up automatically.
5. Update the synthesizer's output template to render the new sub-section.
6. Add a unit test in `test/unit/nodes/initialize-project/phase2/composer-views/`.

## Why some sections may still be empty

After all derivation paths run, a sub-section is `present: false` when:

- The target project has no manifest at all (e.g. a documentation-only repo).
- The sub-section is LLM-judgment-only AND the LLM emitted nothing.

For the second case, the Stop-hook validators ensure the agent doesn't silently drop required-when-applicable fields (see `phase1/structure-analyzer/hooks/validate-service-completeness.ts` and the conditional `min(1)` refinements on `code_patterns` / `representative_examples` / `request_lifecycle`). If the agent shipped without filling a required field, the validator rejects the attempt with a typed `VALIDATION_E*` code and recovery instructions.

## Related files

- `build-composer-views.ts` — the builder
- `schemas.ts` — Zod schemas for the four views
- `../question-consolidator/` — Phase 2 step that runs before composer views
- `../../phase3/synthesis.node.ts` — consumes the composer views
- `services/framework/composer-derivation/` — the deterministic source layer
- `services/framework/language-config/` — the plug-in registry that drives derivation
