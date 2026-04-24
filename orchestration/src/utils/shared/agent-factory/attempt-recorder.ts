import { logger } from '../../logger.js';
import {
  AttemptWriter,
  DebugStore,
  tryActiveDebugStore,
  type AttemptCoords,
  type AttemptMeta,
  type PhaseSlot,
  type ValidationFailureEntry,
} from '../../../services/framework/debug-store/index.js';
import {
  locateClaudeTranscript,
  locateCodexRollout,
  parseClaudeTranscript,
  parseCodexTranscript,
  parseDeepAgentMessages,
  readFileIfExists,
  renderAttemptHtml,
} from '../../../services/framework/transcripts/index.js';
import type { NormalizedEvent } from '../../../services/framework/transcripts/index.js';

const UNKNOWN_PHASE: PhaseSlot = {
  phaseId: 'phase-unknown',
  phaseNumber: 0,
  phaseLabel: 'Unknown phase',
};

export interface BeginRecorderOptions {
  agentName: string;
  sessionId: string;
  attemptNumber: number;
  phase?: PhaseSlot;
  /** Provider tag stored in meta.json (independent of path resolution). */
  provider: 'claude' | 'codex' | 'deepagent';
  model?: string;
  cli?: 'claude' | 'codex' | 'deepagent';
  projectPath: string;
}

/**
 * Returned from `beginAttempt`: a lightweight shim around AttemptWriter that
 * also knows how to finalize the attempt (capture transcript, render HTML,
 * merge meta). Callers don't care whether a debug store is active — if none
 * is registered, every method is a cheap no-op.
 */
export interface AttemptRecorder {
  store: DebugStore | null;
  coords: AttemptCoords;
  writer: AttemptWriter | null;
  startedAtMs: number;

  writePromptInput(text: string): Promise<void>;
  writePromptResolved(text: string): Promise<void>;
  snapshotAgentFile(path: string): Promise<void>;
  writeSettings(settings: string | object): Promise<void>;
  writeOutputSchema(schema: object | string): Promise<void>;
  writeOutput(raw: string, parsed?: string): Promise<void>;
  writeStdout(text: string): Promise<void>;
  writeStderr(text: string): Promise<void>;
  writeErrorSummary(message: string): Promise<void>;
  writeValidationErrors(
    errors: string[] | ValidationFailureEntry[],
    rawText?: string,
  ): Promise<void>;
  mergeMeta(patch: Partial<AttemptMeta>): Promise<void>;
  finalize(outcome: 'success' | 'failure', patch?: Partial<AttemptMeta>): Promise<void>;
  /**
   * Capture the provider's native transcript (Claude JSONL, Codex rollout, or
   * synthesized for DeepAgents) and render HTML next to it.
   *
   * For DeepAgents, pass the final messages via `deepAgentMessages`.
   */
  captureTranscript(opts?: {
    systemPrompt?: string;
    deepAgentMessages?: unknown;
    outcome?: 'success' | 'failure';
    codexSessionIdOverride?: string;
  }): Promise<void>;
}

export function beginAttemptRecorder(opts: BeginRecorderOptions): AttemptRecorder {
  const store = tryActiveDebugStore();
  const phase = opts.phase ?? UNKNOWN_PHASE;
  const coords: AttemptCoords = {
    ...phase,
    agentName: opts.agentName,
    sessionId: opts.sessionId,
    attemptNumber: opts.attemptNumber,
  };
  const writer = store ? store.beginAttempt(coords) : null;
  const startedAtMs = Date.now();

  const ensureMetaBase = async (): Promise<void> => {
    if (!writer) return;
    await writer.mergeMeta({
      provider: opts.provider,
      cli: opts.cli,
      model: opts.model,
      startedAt: new Date(startedAtMs).toISOString(),
      outcome: 'pending',
    });
  };
  // Fire and forget — we want meta.json created as soon as the recorder exists.
  ensureMetaBase().catch(() => undefined);

  return {
    store,
    coords,
    writer,
    startedAtMs,

    async writePromptInput(text) {
      if (!writer) return;
      await writer.writePromptInput(text);
    },
    async writePromptResolved(text) {
      if (!writer) return;
      await writer.writePromptResolved(text);
    },
    async snapshotAgentFile(p) {
      if (!writer) return;
      await writer.snapshotAgentFile(p);
    },
    async writeSettings(settings) {
      if (!writer) return;
      await writer.writeSettings(settings);
    },
    async writeOutputSchema(schema) {
      if (!writer) return;
      await writer.writeOutputSchema(schema);
    },
    async writeOutput(raw, parsed) {
      if (!writer) return;
      await writer.writeOutputRaw(raw);
      if (parsed !== undefined) await writer.writeOutput(parsed);
      else await writer.writeOutput(raw);
    },
    async writeStdout(text) {
      if (!writer) return;
      await writer.writeStdout(text);
    },
    async writeStderr(text) {
      if (!writer) return;
      await writer.writeStderr(text);
    },
    async writeErrorSummary(message) {
      if (!writer) return;
      await writer.writeErrorSummary(message);
    },
    async writeValidationErrors(errors, rawText) {
      if (!writer) return;
      await writer.writeValidationErrors(errors, rawText);
    },
    async mergeMeta(patch) {
      if (!writer) return;
      await writer.mergeMeta(patch);
    },
    async finalize(outcome, patch) {
      if (!writer) return;
      const durationMs = Date.now() - startedAtMs;
      await writer.finalize(outcome, { durationMs, ...(patch ?? {}) });
    },
    async captureTranscript(options = {}) {
      if (!writer) return;
      try {
        const provider = opts.provider;
        let events: NormalizedEvent[] = [];
        let source: AttemptMeta['transcriptSource'] = 'none';
        let nativeContent: string | null = null;

        if (provider === 'claude') {
          const transcriptPath = await locateClaudeTranscript(opts.projectPath, opts.sessionId, {
            timeoutMs: 3000,
          });
          if (transcriptPath) {
            nativeContent = await readFileIfExists(transcriptPath);
            if (nativeContent) {
              source = 'claude-home';
              events = parseClaudeTranscript(nativeContent, { sessionId: opts.sessionId });
            }
          }
        } else if (provider === 'codex') {
          const sessionForLookup = options.codexSessionIdOverride ?? opts.sessionId;
          const rolloutPath = await locateCodexRollout(sessionForLookup, { timeoutMs: 3000 });
          if (rolloutPath) {
            nativeContent = await readFileIfExists(rolloutPath);
            if (nativeContent) {
              source = 'codex-home';
              events = parseCodexTranscript(nativeContent, { sessionId: sessionForLookup });
            }
          }
        } else if (provider === 'deepagent') {
          events = parseDeepAgentMessages({
            sessionId: opts.sessionId,
            model: opts.model,
            agent: opts.agentName,
            startedAt: new Date(startedAtMs).toISOString(),
            endedAt: new Date().toISOString(),
            messages: options.deepAgentMessages,
            outcome: options.outcome ?? 'success',
            systemPrompt: options.systemPrompt,
          });
          // Serialize synthetic native transcript so there is still a .jsonl on disk.
          nativeContent = events.map((e) => JSON.stringify(e)).join('\n');
          source = 'deepagent-synth';
        }

        if (nativeContent) {
          await writer.writeNativeTranscript(nativeContent);
        }
        if (events.length > 0) {
          await writer.writeNormalizedEvents(events.map((e) => JSON.stringify(e)).join('\n'));
          const metaPatch: Partial<AttemptMeta> = {
            transcriptSource: source,
            transcriptCaptured: source !== 'none',
          };
          await writer.mergeMeta(metaPatch);

          const meta = await loadMeta(writer);
          const html = await renderAttemptHtml({ events, meta: meta ?? {} });
          await writer.writeRenderedHtml(html);
          await writer.mergeMeta({ htmlRendered: true });
        } else {
          await writer.mergeMeta({ transcriptSource: source, transcriptCaptured: false });
        }
      } catch (err) {
        logger.warn(
          `[attempt-recorder] captureTranscript failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    },
  };
}

async function loadMeta(writer: AttemptWriter): Promise<Partial<AttemptMeta> | null> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const p = path.join(writer.attemptDir, 'meta.json');
    const content = await fs.readFile(p, 'utf-8');
    return JSON.parse(content) as Partial<AttemptMeta>;
  } catch {
    return null;
  }
}
