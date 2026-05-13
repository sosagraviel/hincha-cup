/**
 * Runtime-version extraction table.
 *
 * This module is a thin view over the centralized language-config registry.
 * Add a new runtime-version file by adding/updating its language entry under
 * `language-config/languages/`, not by editing this table.
 *
 * The `tool-versions-raw` extractor is asdf's lingua franca and not
 * language-specific, so it lives here rather than in any single language entry.
 */

import {
  allRuntimeVersionFiles,
  knownRuntimeVersionFilenames,
  parseToolVersions,
  resolveRuntimeExtractor as registryResolveRuntimeExtractor,
} from '../language-config/index.js';
import { trim } from '../language-config/extractors.js';
import type { RuntimeVersionEntry } from '../language-config/index.js';

export interface RuntimeVersionExtractor {
  /** Free-form lowercase identifier of the language family. */
  readonly key: string;
  /** Project-relative path of the canonical version-pin file. */
  readonly filename: string;
  /** When true, treat `filename` as a suffix match against any file in the project root. */
  readonly suffix?: boolean;
  /** Pure function — given the file contents, extract a version (or null). */
  readonly extract: (contents: string) => string | null;
}

/** Special-case multi-runtime asdf file — kept here, not in any single language. */
const TOOL_VERSIONS_RAW: RuntimeVersionExtractor = {
  key: 'tool-versions-raw',
  filename: '.tool-versions',
  extract: (contents) => trim(contents),
};

/** Computed from the language registry plus the asdf special case. */
export const RUNTIME_VERSION_TABLE: ReadonlyArray<RuntimeVersionExtractor> = [
  ...allRuntimeVersionFiles().map(toLegacyShape),
  TOOL_VERSIONS_RAW,
];

function toLegacyShape(entry: RuntimeVersionEntry): RuntimeVersionExtractor {
  return { key: entry.key, filename: entry.filename, extract: entry.extract };
}

/**
 * Resolve a version extractor by exact filename. Returns null when
 * no entry matches.
 */
export function resolveRuntimeExtractor(filename: string): RuntimeVersionExtractor | null {
  if (filename === TOOL_VERSIONS_RAW.filename) return TOOL_VERSIONS_RAW;
  const entry = registryResolveRuntimeExtractor(filename);
  return entry ? toLegacyShape(entry) : null;
}

/** All filenames the inspector should look for at the project root. */
export function knownRuntimeVersionFilenamesIncludingToolVersions(): ReadonlyArray<string> {
  return [...knownRuntimeVersionFilenames(), TOOL_VERSIONS_RAW.filename];
}

export { knownRuntimeVersionFilenames, parseToolVersions };
