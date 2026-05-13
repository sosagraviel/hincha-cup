/**
 * Prompt-scripts renderer entry point.
 *
 * `renderPromptScripts(body, ctx)` walks the prompt body, finds every
 * `<<script:NAME arg1=val1 arg2=val2>>` token, executes the matching
 * handler, and replaces the token with the handler's stdout. Tokens
 * that don't match a registered script render as an inline comment
 * marker so the prompt stays valid.
 */

import type { PromptScriptContext, PromptScriptHandler } from './types.js';
import { getPromptScript } from './registry.js';

export type { PromptScriptContext, PromptScriptHandler } from './types.js';
export { PROMPT_SCRIPT_REGISTRY, getPromptScript } from './registry.js';

const TOKEN_RE = /<<script:([a-z][a-z0-9_-]*)((?:\s+[a-z_][a-z0-9_-]*=(?:"[^"]*"|\S+))*)\s*>>/gi;

/**
 * Replace every `<<script:name args>>` token in `body` with the
 * matching handler's output. Idempotent on bodies that contain no
 * tokens (returns the input verbatim).
 */
export function renderPromptScripts(body: string, ctx: PromptScriptContext): string {
  return body.replace(TOKEN_RE, (_match, rawName: string, rawArgs: string) => {
    const name = rawName.toLowerCase();
    const handler = getPromptScript(name);
    if (!handler) {
      return `<!-- prompt-script: unknown name '${name}' -->`;
    }
    const args = parseArgs(rawArgs);
    try {
      return handler.run(args, ctx);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return `<!-- prompt-script '${name}' failed: ${msg.replace(/-->/g, '--&gt;')} -->`;
    }
  });
}

function parseArgs(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /(\w[\w-]*)=("[^"]*"|\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const value = m[2].startsWith('"') && m[2].endsWith('"') ? m[2].slice(1, -1) : m[2];
    out[m[1]] = value;
  }
  return out;
}
