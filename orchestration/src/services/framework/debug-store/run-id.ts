import { randomBytes } from 'crypto';

/**
 * Generate a ULID-ish run identifier.
 *
 * Not a spec-compliant ULID (we don't ship Crockford's base32 encoder), but it
 * sorts lexicographically by timestamp and has enough randomness to avoid
 * collisions within a single machine. Format:
 *
 *   <base36 ms since epoch>-<hex randomness>
 *
 * Example: `lwn2ab3k-7f3c1d2e`
 */
export function generateRunId(now: Date = new Date()): string {
  const ts = now.getTime().toString(36);
  const rand = randomBytes(8).toString('hex');
  return `${ts}-${rand}`;
}

/**
 * Build a stable, disk-sortable id from a Date. Used for timestamped run
 * folders where readability matters more than entropy.
 */
export function timestampStamp(now: Date = new Date()): string {
  const iso = now.toISOString();
  return iso.slice(0, 19).replace(/[:]/g, '-');
}

/**
 * Compose a human-readable, disk-sortable run id:
 *
 *   run-2026-04-23T12-34-56-lwn2ab3k7f3c
 */
export function composeRunFolderName(now: Date = new Date()): string {
  return `run-${timestampStamp(now)}-${randomBytes(6).toString('hex')}`;
}
