/**
 * Provider-aware skill copier.
 *
 * Copies a skill directory from the framework `skills/**` tree into a target
 * project's `.<provider>/skills/<name>/` directory. Handles two provider
 * divergence patterns:
 *
 * - **Dual SKILL files** (`SKILL.claude.md` + `SKILL.codex.md`): heavy
 *   divergence skills keep a separate file per provider. The matching variant
 *   is copied as `SKILL.md` in the destination; the other variant is skipped.
 * - **Placeholder substitution**: `.md` files contain `{{TEMP_DIR}}`,
 *   `{{CONFIG_DIR}}`, etc. tokens that are replaced with provider-specific
 *   values at copy time.
 *
 * Safety: if both `SKILL.md` and `SKILL.<provider>.md` exist in the same
 * directory we throw — an ambiguous source is a maintenance bug, not a
 * conflict to resolve silently.
 */
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
  copyFileSync,
  mkdirSync,
} from 'fs';
import { join } from 'path';
import { Provider } from '../../../../providers/types.js';
import { hasPlaceholders, substitutePlaceholders } from '../../../../utils/skill-placeholders.js';

const SKILL_VARIANT_PATTERN = /^SKILL\.([a-z0-9-]+)\.md$/;

interface SkillFileSelection {
  /** Absolute path to the SKILL file that should be copied into the destination, or null if none exists. */
  sourcePath: string | null;
  /** Names of provider-specific SKILL variants present in the source dir (used to skip the other provider's file). */
  variantFileNames: Set<string>;
}

/**
 * Decide which `SKILL.md` / `SKILL.<provider>.md` file to copy for `provider`.
 * Throws when the source directory is ambiguous (both plain and provider variants present).
 */
function selectSkillFile(srcDir: string, provider: Provider): SkillFileSelection {
  const plainPath = join(srcDir, 'SKILL.md');
  const hasPlain = existsSync(plainPath);

  const variantFileNames = new Set<string>();
  const entries = existsSync(srcDir) ? readdirSync(srcDir) : [];

  let providerVariantPath: string | null = null;

  for (const entry of entries) {
    const match = SKILL_VARIANT_PATTERN.exec(entry);
    if (!match) continue;
    variantFileNames.add(entry);
    if (match[1] === provider) {
      providerVariantPath = join(srcDir, entry);
    }
  }

  if (hasPlain && variantFileNames.size > 0) {
    throw new Error(
      `Ambiguous skill source at ${srcDir}: found both SKILL.md and provider-specific variants (${Array.from(variantFileNames).join(', ')}). Use one or the other, not both.`,
    );
  }

  if (providerVariantPath) {
    return { sourcePath: providerVariantPath, variantFileNames };
  }
  if (variantFileNames.size > 0 && !providerVariantPath) {
    // Provider-specific skill with no variant for the requested provider
    return { sourcePath: null, variantFileNames };
  }
  if (hasPlain) {
    return { sourcePath: plainPath, variantFileNames };
  }
  return { sourcePath: null, variantFileNames };
}

/**
 * Copy a single file with optional placeholder substitution (for `.md` files).
 */
function copyFileWithSubstitution(srcPath: string, destPath: string, provider: Provider): void {
  if (srcPath.endsWith('.md')) {
    const raw = readFileSync(srcPath, 'utf-8');
    const content = hasPlaceholders(raw) ? substitutePlaceholders(raw, provider) : raw;
    mkdirSync(join(destPath, '..'), { recursive: true });
    writeFileSync(destPath, content);
  } else {
    mkdirSync(join(destPath, '..'), { recursive: true });
    copyFileSync(srcPath, destPath);
  }
}

/**
 * Recursively copy the contents of `srcDir` into `destDir`, excluding the set
 * of filenames in `skipFileNames` at the top level only.
 */
function copyTree(
  srcDir: string,
  destDir: string,
  provider: Provider,
  skipFileNames: Set<string>,
  isTopLevel: boolean,
): number {
  if (!existsSync(srcDir)) return 0;

  mkdirSync(destDir, { recursive: true });
  let fileCount = 0;

  for (const entry of readdirSync(srcDir)) {
    if (isTopLevel && skipFileNames.has(entry)) continue;

    const srcEntryPath = join(srcDir, entry);
    const destEntryPath = join(destDir, entry);
    const stat = statSync(srcEntryPath);

    if (stat.isDirectory()) {
      fileCount += copyTree(srcEntryPath, destEntryPath, provider, skipFileNames, false);
    } else {
      copyFileWithSubstitution(srcEntryPath, destEntryPath, provider);
      fileCount++;
    }
  }

  return fileCount;
}

/**
 * Copy one skill directory for the active provider.
 *
 * - Resolves which `SKILL.*.md` to write as the destination's `SKILL.md`.
 * - Copies all other files, skipping the non-matching provider's SKILL variant.
 * - Applies placeholder substitution to all `.md` files.
 *
 * @returns Number of files written to the destination.
 */
export function copySkillForProvider(srcDir: string, destDir: string, provider: Provider): number {
  if (!existsSync(srcDir)) return 0;

  const { sourcePath, variantFileNames } = selectSkillFile(srcDir, provider);

  // Skip every provider-specific SKILL variant at the top level; we write the
  // selected one (if any) as `SKILL.md` manually below.
  const skipTopLevel = new Set<string>(variantFileNames);
  skipTopLevel.add('SKILL.md'); // handled explicitly

  let fileCount = copyTree(srcDir, destDir, provider, skipTopLevel, true);

  if (sourcePath) {
    const destSkillPath = join(destDir, 'SKILL.md');
    copyFileWithSubstitution(sourcePath, destSkillPath, provider);
    fileCount++;
  }

  return fileCount;
}
