/**
 * Repository shape summary derivation.
 *
 * Templated 1–3 sentence factual paragraph the synthesizer can elaborate
 * on. Stack-agnostic: every value comes from the project inspection or
 * the file-counter result, never from a hardcoded enum.
 */

import type { DeriveInput } from './types.js';

export function deriveRepositoryShapeSummary(input: DeriveInput): string {
  const { inspection } = input;
  const repoType = inspection.repository_type ?? 'single-service';
  const workspaceTool = inspection.monorepo?.workspace_tool;
  const workspacePaths = inspection.monorepo?.workspace_paths ?? [];
  const manifestCount = inspection.manifests.length;
  const serviceCount = input.services?.length ?? manifestCount;

  const langs = (input.fileCounts ?? [])
    .filter((l) => l.count > 0)
    .sort((a, b) => b.count - a.count)
    .map((l) => l.language);

  const sentences: string[] = [];

  if (repoType === 'monorepo') {
    const tool = workspaceTool ? `${workspaceTool} ` : '';
    sentences.push(
      `${tool}monorepo with ${serviceCount} service${serviceCount === 1 ? '' : 's'}${
        workspacePaths.length > 0 ? ` under ${workspacePaths.join(', ')}` : ''
      }.`,
    );
  } else if (repoType === 'polyrepo') {
    sentences.push(`Polyrepo layout: ${serviceCount} service${serviceCount === 1 ? '' : 's'}.`);
  } else {
    sentences.push(
      `Single-service repository${manifestCount > 0 ? ` (${manifestCount} manifest${manifestCount === 1 ? '' : 's'})` : ''}.`,
    );
  }

  if (langs.length > 0) {
    const top = langs.slice(0, 4);
    sentences.push(
      `Dominant language${top.length === 1 ? '' : 's'}: ${top.join(', ')}${langs.length > top.length ? ', …' : ''}.`,
    );
  }

  const runtimes = inspection.runtime_versions ?? {};
  const runtimeKeys = Object.keys(runtimes).filter((k) => k !== 'tool-versions-raw');
  if (runtimeKeys.length > 0) {
    const pairs = runtimeKeys.map((k) => `${k}=${runtimes[k]}`);
    sentences.push(`Runtimes: ${pairs.join(', ')}.`);
  }

  return sentences.join(' ').trim();
}
