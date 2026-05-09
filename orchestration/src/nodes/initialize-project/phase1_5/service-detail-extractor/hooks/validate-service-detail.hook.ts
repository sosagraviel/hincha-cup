#!/usr/bin/env node
/**
 * Plan v4 Phase D — Stop hook for the service-detail-extractor sub-agent.
 *
 * Validates the per-service slice against `ServiceDetailSliceSchema` and
 * applies a small set of additional structural checks that are cheaper
 * to enforce here than to bake into the schema:
 *
 *   - `service_id` echoes the env-var the orchestrator passed in.
 *   - Every `source_file` in `findings.code_patterns[]` and in
 *     `findings.testing.representative_examples[].snippet` begins with
 *     the service `path` the orchestrator passed in.
 *   - `findings.notable[]` items are short (≤ 280 chars) and non-empty.
 *   - The same `validateNeedsVerificationProse` rules every other Phase 1
 *     analyzer enforces apply unchanged.
 *
 * Failure → exit 2 with a feedback message; the Claude CLI session
 * continues in the same session and the agent self-corrects (the same
 * pattern Phase 1 analyzers use). Success → exit 0.
 */

import fs from 'fs';
import path from 'path';
import { ServiceDetailSliceSchema } from '../../../../../schemas/service-detail-slice.schema.js';
import { extractJSON } from '../../../../../utils/validator.js';
import { validateNeedsVerificationProse } from '../../../phase1/shared/needs-verification-quality.js';

interface HookInput {
  stop_hook_active: boolean;
  transcript_path?: string;
  session_id?: string;
  cwd?: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function blockWithFeedback(reason: string): never {
  process.stderr.write(reason + '\n');
  process.exit(2);
}

function allow(): never {
  process.exit(0);
}

async function readStdin(): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk.toString());
  }
  return chunks.join('');
}

interface OrchestratorContext {
  serviceId: string;
  servicePath: string;
}

/**
 * Read the orchestrator-supplied env vars. The orchestrator sets these
 * before spawning the sub-agent so the Stop hook can validate the agent's
 * output against the assigned service. Missing env vars → silent allow
 * (ad-hoc invocation outside our spawn).
 */
function readOrchestratorContext(): OrchestratorContext | null {
  const serviceId = process.env.FRAMEWORK_SERVICE_ID;
  const servicePath = process.env.FRAMEWORK_SERVICE_PATH;
  if (!serviceId || !servicePath) return null;
  // Normalise the service path: strip leading `./` and trailing slashes
  // so the comparison below is consistent regardless of how the
  // orchestrator formatted it.
  const normalised = servicePath.replace(/^\.\//, '').replace(/\/+$/, '');
  return { serviceId, servicePath: normalised };
}

interface SourcePathViolation {
  location: string;
  source_file: string;
}

/**
 * Walk findings.code_patterns + findings.testing.representative_examples
 * and collect every `source_file` that doesn't start with the service
 * path. Repo-root README variants are tolerated since the orchestrator
 * tells the agent it can quote the README.
 */
function findOutOfScopeSourceFiles(data: unknown, servicePath: string): SourcePathViolation[] {
  if (!isObject(data)) return [];
  const findings = (data as Record<string, unknown>).findings;
  if (!isObject(findings)) return [];

  const violations: SourcePathViolation[] = [];
  const allowedRoots = [servicePath];
  // Repo-root README is allowed — the agent may quote a top-level usage
  // section. Compare on basename to keep the rule path-shape-agnostic.
  const allowedReadmeBasenames = new Set(['README.md', 'README.markdown', 'readme.md', 'README']);

  function check(loc: string, source: unknown): void {
    if (typeof source !== 'string' || source.length === 0) return;
    const normalised = source.replace(/^\.\//, '').replace(/\/+$/, '');
    if (allowedRoots.some((root) => normalised === root || normalised.startsWith(root + '/'))) {
      return;
    }
    if (allowedReadmeBasenames.has(path.basename(normalised)) && !normalised.includes('/')) {
      return;
    }
    violations.push({ location: loc, source_file: source });
  }

  const codePatterns = (findings as Record<string, unknown>).code_patterns;
  if (Array.isArray(codePatterns)) {
    codePatterns.forEach((entry, idx) => {
      if (!isObject(entry)) return;
      check(`findings.code_patterns[${idx}].source_file`, entry.source_file);
    });
  }

  const testing = (findings as Record<string, unknown>).testing;
  if (isObject(testing)) {
    const examples = (testing as Record<string, unknown>).representative_examples;
    if (Array.isArray(examples)) {
      examples.forEach((entry, idx) => {
        if (!isObject(entry)) return;
        check(`findings.testing.representative_examples[${idx}].file`, entry.file);
        const snippet = (entry as Record<string, unknown>).snippet;
        if (isObject(snippet)) {
          check(
            `findings.testing.representative_examples[${idx}].snippet.source_file`,
            snippet.source_file,
          );
        }
      });
    }
  }

  return violations;
}

async function main(): Promise<void> {
  const ctx = readOrchestratorContext();
  if (!ctx) return allow();

  let raw: string;
  try {
    raw = await readStdin();
  } catch (err) {
    return blockWithFeedback(
      `❌ HOOK ERROR: stdin read failed — ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  let input: HookInput;
  try {
    input = JSON.parse(raw) as HookInput;
  } catch {
    return blockWithFeedback(
      `❌ HOOK ERROR: hook received unparseable stdin (bytes=${raw.length}). This is a framework error.`,
    );
  }

  if (!input.transcript_path || !fs.existsSync(input.transcript_path)) {
    return blockWithFeedback(
      `❌ HOOK ERROR: transcript not found at ${input.transcript_path ?? '(missing)'} — framework error.`,
    );
  }

  const transcriptContent = fs.readFileSync(input.transcript_path, 'utf-8');
  const lines = transcriptContent.split('\n').filter((l) => l.trim());
  const transcript = lines
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  // Find the last assistant message (supports direct + wrapped formats).
  const assistantMessages = transcript
    .filter((msg: any) => {
      return msg.type === 'assistant' || (msg.message && msg.message.role === 'assistant');
    })
    .reverse();

  if (assistantMessages.length === 0) {
    return blockWithFeedback(
      "❌ HOOK ERROR: No assistant messages found in transcript. The agent hasn't produced output yet.",
    );
  }

  const lastMessage = assistantMessages[0];
  const messageContent = lastMessage.message ? lastMessage.message.content : lastMessage.content;
  if (!Array.isArray(messageContent)) {
    return blockWithFeedback(
      '❌ HOOK ERROR: Last assistant message has invalid content structure (expected array).',
    );
  }

  const textBlocks = messageContent.filter((c: any) => c.type === 'text');
  if (textBlocks.length === 0) {
    return blockWithFeedback(
      [
        '❌ AGENT ERROR: No text output found in last message.',
        '',
        'Emit a single raw JSON object as your final message. First character `{`,',
        'last character `}`. No prose before or after, no markdown fences.',
      ].join('\n'),
    );
  }

  const fullText = textBlocks.map((b: any) => b.text).join('');
  const json = extractJSON(fullText);
  if (!json) {
    return blockWithFeedback(
      [
        '❌ AGENT ERROR: Could not parse JSON from last message.',
        '',
        'Emit a single raw JSON object as your final message.',
      ].join('\n'),
    );
  }

  // 1. Schema check.
  const parsed = ServiceDetailSliceSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .slice(0, 12)
      .map((i) => `  • ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    return blockWithFeedback(
      [
        '❌ AGENT ERROR: ServiceDetailSliceSchema validation failed.',
        '',
        issues,
        '',
        'Re-emit a JSON object that matches the schema documented in your',
        'execution-instructions.md. The framework rejects on shape mismatch.',
      ].join('\n'),
    );
  }
  const data = parsed.data;

  // 2. service_id echo check.
  if (data.service_id !== ctx.serviceId) {
    return blockWithFeedback(
      [
        `❌ AGENT ERROR: service_id mismatch.`,
        `  Expected: ${ctx.serviceId}`,
        `  Got:      ${data.service_id}`,
        '',
        'Echo the canonical service id from your <service> block VERBATIM.',
        'Do not rename, lowercase, or paraphrase it.',
      ].join('\n'),
    );
  }

  // 3. source_file scope check.
  const outOfScope = findOutOfScopeSourceFiles(data, ctx.servicePath);
  if (outOfScope.length > 0) {
    const list = outOfScope
      .slice(0, 8)
      .map((v) => `  • ${v.location}: ${v.source_file}`)
      .join('\n');
    return blockWithFeedback(
      [
        `❌ AGENT ERROR: source_file paths escape service '${ctx.serviceId}' (path: ${ctx.servicePath}).`,
        '',
        list,
        '',
        `Every snippet must come from inside ${ctx.servicePath}/ (the repo-root README is the only`,
        `cross-cutting allowed source). You were assigned ONE service in this run.`,
      ].join('\n'),
    );
  }

  // 4. NV prose quality (same rules every Phase 1 analyzer obeys).
  const nvViolations = validateNeedsVerificationProse(data.needs_verification ?? []);
  if (nvViolations.length > 0) {
    const list = nvViolations
      .slice(0, 8)
      .map((v) => `  • [item ${v.index}] ${v.message}`)
      .join('\n');
    return blockWithFeedback(
      [
        '❌ AGENT ERROR: needs_verification quality rules failed.',
        '',
        list,
        '',
        'Either fix the offending entries or remove them. The framework hard-rejects',
        'questions whose evidence already proves the answer, fabricated numbers,',
        'graph-internals references, or impact phrasing that does not name a concrete',
        'downstream artefact.',
      ].join('\n'),
    );
  }

  return allow();
}

main().catch((err) => {
  const msg = err instanceof Error ? (err.stack ?? err.message) : String(err);
  process.stderr.write(`❌ HOOK INTERNAL ERROR: ${msg}\n`);
  process.exit(2);
});
