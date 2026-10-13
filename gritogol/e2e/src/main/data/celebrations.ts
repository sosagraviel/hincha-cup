import { fileURLToPath } from 'node:url';

/** Video files the fan can pick in the "Subir festejo" file chooser, by the name used in the Gherkin. */
const files: Record<string, string> = {
  // ~3 s real VP8 WebM clip; the client extracts frames from it before uploading.
  'celebration.webm': fileURLToPath(new URL('./files/celebration.webm', import.meta.url)),
};

export function celebrationFile(name: string): string {
  const path = files[name];
  if (!path) throw new Error(`Unknown celebration file "${name}". Known: ${Object.keys(files).join(', ')}`);
  return path;
}

/** Matches as named in the Gherkin → how the header shows them. */
const matches: Record<string, { headerLabel: string }> = {
  'Uruguay vs España': { headerLabel: 'URU – ESP' },
};

export function matchByName(name: string): { headerLabel: string } {
  const match = matches[name];
  if (!match) throw new Error(`Unknown match "${name}". Known: ${Object.keys(matches).join(', ')}`);
  return match;
}
