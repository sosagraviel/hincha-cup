/**
 * Heuristic quality gate for `needs_verification` items.
 *
 * Plan §C 4.3 (gira-exhaustive followup, 2026-05-05). The 2026-05-04
 * gira run shipped speculative items the framework rule explicitly
 * excludes:
 *
 *   - "Is AWS S3 integration implemented in the backend source code?"
 *     — answer derivable from dependency manifests (no `@aws-sdk/*`
 *     packages = no S3 SDK in use).
 *   - "Is there a CI/CD pipeline configured outside this repository?"
 *     — by definition unknowable from the repo.
 *   - "What are the production Sentry DSN, org, and credentials?" —
 *     credentials are always external by design.
 *
 * The validator-side rule (`verification-format.md`) tells the agent
 * not to emit such items. This module is the run-time signal: a soft
 * warning surfaced in the analyzer output so the operator can see
 * trends across runs (and CI can fail if the rate spikes).
 *
 * Stack-agnostic: every detection token is a category word ("credential",
 * "outside this repository", "production", "deployment server",
 * "manifest" derivable). No language family bias.
 */

const SPECULATIVE_TOKENS: Array<{ pattern: RegExp; reason: string }> = [
  // Credentials / secrets — always external by design.
  {
    pattern:
      /\b(?:credentials?|api\s+keys?|secrets?|tokens?|dsn|connection\s+strings?|passwords?)\b/i,
    reason: 'credentials are always external — repos intentionally do not contain them',
  },
  // Things outside the repo — CI/CD elsewhere, vendor systems, etc.
  {
    pattern: /\boutside\s+(?:this\s+)?(?:repository|repo|codebase)\b/i,
    reason: 'items outside this repo cannot be verified by reading this repo',
  },
  {
    pattern: /\b(?:configured|managed|maintained)\s+(?:outside|by\s+another\s+team|elsewhere)\b/i,
    reason: 'items managed outside this repo cannot be verified by reading this repo',
  },
  // Production deployment / infra topology that lives elsewhere.
  {
    pattern: /\bproduction\s+(?:deployment|infrastructure|environment|server|host|url|endpoint)\b/i,
    reason:
      'production deployment / infrastructure details live outside the repo (vendor portal / IaC repo)',
  },
  {
    pattern: /\bdeployment\s+server\b/i,
    reason: 'deployment server details live outside the repo',
  },
];

/**
 * Inspect a `needs_verification` array. Returns true when at least
 * one item matches a speculative pattern. The caller surfaces a
 * `speculative_needs_verification` soft warning so the operator can
 * spot trends.
 *
 * Bounded to the documented format: each item has a `question` and
 * a `reason` string. Anything else is treated as already-malformed
 * (the schema validator handles structural issues).
 */
export function hasSpeculativeNeedsVerification(items: unknown): boolean {
  if (!Array.isArray(items)) return false;
  for (const item of items) {
    if (item === null || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const text = [
      typeof rec.question === 'string' ? rec.question : '',
      typeof rec.reason === 'string' ? rec.reason : '',
    ]
      .filter((s) => s.length > 0)
      .join(' ');
    if (text.length === 0) continue;
    for (const { pattern } of SPECULATIVE_TOKENS) {
      if (pattern.test(text)) return true;
    }
  }
  return false;
}

/**
 * For diagnostic / debug-store output: return the per-item match
 * details so the run report can attribute the soft warning to a
 * specific question. Empty array when nothing matches.
 */
export interface SpeculativeMatch {
  index: number;
  question: string;
  reason: string;
}

export function findSpeculativeNeedsVerification(items: unknown): SpeculativeMatch[] {
  if (!Array.isArray(items)) return [];
  const out: SpeculativeMatch[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item === null || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const question = typeof rec.question === 'string' ? rec.question : '';
    const itemReason = typeof rec.reason === 'string' ? rec.reason : '';
    const text = [question, itemReason].filter((s) => s.length > 0).join(' ');
    if (text.length === 0) continue;
    for (const { pattern, reason } of SPECULATIVE_TOKENS) {
      if (pattern.test(text)) {
        out.push({ index: i, question, reason });
        break;
      }
    }
  }
  return out;
}
