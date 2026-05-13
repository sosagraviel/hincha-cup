/**
 * Scripts-in-prompts subsystem.
 *
 * Prompts can declare data dependencies via `<<script:name arg=value>>`
 * tokens. At prompt-build time, the renderer replaces each token with
 * the script's stdout. This pushes deterministic data out of the
 * prompt body so:
 *
 *   (a) the agent reads pre-computed answers instead of running its
 *       own tool calls, and
 *   (b) the prompt body itself stays small and stable across runs.
 *
 * The notation chosen — `<<script:name k=v>>` — is renderer-only and
 * never reaches the agent. Compare with Claude Code skills' official
 * `` !`cmd` `` syntax (which Claude executes itself); we deliberately
 * use a different sigil so framework-side rendering and skill-side
 * shell execution don't conflict.
 */

export interface PromptScriptContext {
  projectPath: string;
  frameworkPath: string;
  tempDir: string;
  /** Optional per-call extras (e.g. service id for service-scoped scripts). */
  readonly extras?: Record<string, unknown>;
}

export interface PromptScriptHandler {
  /** Stable lowercase name used in `<<script:name>>` tokens. */
  readonly name: string;
  /** One-line description for self-documentation. */
  readonly description: string;
  /**
   * Pure function — given (args, context), return a markdown / text
   * string. Failures fall back to an inline comment marker so the
   * prompt remains valid markdown.
   */
  run(args: Record<string, string>, context: PromptScriptContext): string;
}
