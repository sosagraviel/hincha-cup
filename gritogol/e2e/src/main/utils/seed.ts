import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

/**
 * Re-seeds the local emulators with the app's own seed command (default `make seed`, run from the app folder,
 * i.e. the parent of e2e/). Seed data includes the "Uruguay vs España" match with 47 "pelotas".
 */
export function runSeed(): void {
  const command = process.env.SEED_COMMAND ?? 'make seed';
  const cwd = resolve(process.cwd(), process.env.APP_DIR ?? '..');
  execSync(command, { cwd, stdio: 'pipe', timeout: 180_000 });
}
