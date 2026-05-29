---
name: code-conventions
description: Project-specific coding conventions, gotchas, and WRONG/CORRECT examples
disable-model-invocation: false
version: 1.0
---

# Code Conventions

## Naming Conventions

- **File names**: kebab-case (`prompt-loader.ts`, `workspace-detector.ts`). Consistent with Node.js ecosystem.
- **Hook files**: suffix with `.hook.ts` (`restrict-agent-paths.hook.ts`). Distinguishes lifecycle hooks from general utilities.
- **Test files**: suffix with `.test.ts` (`prompt-loader.test.ts`). Matches Jest default discovery.
- **Classes**: PascalCase. **Functions and variables**: camelCase. **Constants**: SCREAMING_SNAKE_CASE.
- **Node directories**: kebab-case matching phase and feature (`phase1/structure-analyzer`, `phase4/file-counter`).

## Error Handling

- LangGraph node functions return a partial `AgentState` — never throw unless the graph must halt entirely.
- Catch errors inside nodes; set an error state key and return rather than propagating exceptions through the graph.
- Shell scripts in `scripts/` must begin with `set -e`; write descriptive messages to stderr before any non-zero exit.

## Gotchas

### Load Prompts via `prompt-loader`, Not Raw File I/O

Raw `fs.readFile` bypasses template substitution and project-relative path resolution.

```typescript
// WRONG
import { readFileSync } from 'fs';
const prompt = readFileSync('./prompts/analyze.md', 'utf-8');
```

```typescript
// CORRECT
import { loadPrompt } from '../../utils/shared/prompt-loader';
const prompt = await loadPrompt('analyze');
```

### Register Hooks Before `graph.compile()`

Hooks attached after compilation are silently ignored.

```typescript
// WRONG
const app = graph.compile();
app.hooks.push(myHook); // no-op
```

```typescript
// CORRECT
graph.addNode('validate', myHook);
const app = graph.compile();
```

## Code-Style Conventions

- **Import order**: Node built-ins → third-party → monorepo-local → relative. ESLint `import/order` enforces this.
- **No `any`**: use `unknown` + type guard or a named interface. Catches shape mismatches at compile time.
- **`const` over `let`**: prevents accidental reassignment in async LangGraph callbacks. Never `var`.
- **One export per file** for node functions; barrel `index.ts` only at the phase root, not nested deeper.
- **No inline comments** describing what code does — function and variable names carry that meaning.