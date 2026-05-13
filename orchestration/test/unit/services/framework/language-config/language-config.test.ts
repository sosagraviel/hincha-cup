import { describe, it, expect } from 'vitest';
import {
  getAllLanguages,
  getLanguageByKey,
  getLanguageByExtension,
  allManifests,
  allLockFiles,
  allRuntimeVersionFiles,
  allToolTokens,
  resolveLockFileManager,
  resolveManifestEntry,
  resolveRuntimeExtractor,
  knownLockFileBasenames,
  knownExactManifestBasenames,
  knownManifestSuffixes,
  knownRuntimeVersionFilenames,
  manifestKindToManagerMap,
  parseToolVersions,
  allManifestPatternsForDiscovery,
  languageExtensionsMap,
  manifestInfoMap,
  primaryManifestFilenames,
  commandDefaultsByLanguage,
  languagesWithImplementerAgent,
  utilityLanguageKeys,
} from '../../../../../src/services/framework/language-config/index.js';

describe('language-config registry', () => {
  describe('registry consistency', () => {
    it('exposes at least the v6 set of languages (regression guard)', () => {
      const keys = getAllLanguages().map((l) => l.key);
      // Languages the registry MUST include — these were in the
      // pre-v7 scattered tables and downstream code may already
      // reference them.
      const required = [
        'javascript',
        'typescript',
        'python',
        'go',
        'rust',
        'java',
        'kotlin',
        'ruby',
        'php',
        'csharp',
        'swift',
        'dart',
        'elixir',
        'scala',
      ];
      for (const k of required) {
        expect(keys).toContain(k);
      }
    });

    it('every language has a unique key', () => {
      const keys = getAllLanguages().map((l) => l.key);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it('every language has a non-empty displayName', () => {
      for (const l of getAllLanguages()) {
        expect(l.displayName.length).toBeGreaterThan(0);
      }
    });

    it('every language has at least one extension', () => {
      for (const l of getAllLanguages()) {
        expect(l.extensions.length).toBeGreaterThan(0);
      }
    });

    it('extensions are unique across languages (no two languages claim the same extension)', () => {
      const seen = new Map<string, string>();
      for (const l of getAllLanguages()) {
        for (const ext of l.extensions) {
          const prior = seen.get(ext);
          // Allow `extends` chains (TypeScript adds tsx; that's
          // intentional, but two unrelated languages must not collide).
          if (prior && !(l.extends ?? []).includes(prior)) {
            // A few well-known overlaps are tolerated (e.g. Kotlin/Java share build files).
            // The rule applies to source-file extensions only.
            const allowedOverlaps: Record<string, string[]> = {};
            const allowed = allowedOverlaps[ext] ?? [];
            if (!allowed.includes(l.key) && !allowed.includes(prior)) {
              throw new Error(`extension '${ext}' claimed by both '${prior}' and '${l.key}'`);
            }
          }
          seen.set(ext, l.key);
        }
      }
    });

    it('every `extends` reference resolves to a registered language', () => {
      for (const l of getAllLanguages()) {
        for (const parent of l.extends ?? []) {
          expect(
            getLanguageByKey(parent),
            `language '${l.key}' extends unknown '${parent}'`,
          ).toBeDefined();
        }
      }
    });

    it('externalServiceSdks entries have non-empty pkg + vendor + purpose', () => {
      for (const l of getAllLanguages()) {
        for (const entry of l.toolTokens?.externalServiceSdks ?? []) {
          expect(entry.pkg, `${l.key}: externalServiceSdks entry missing pkg`).toBeTruthy();
          expect(entry.vendor, `${l.key}: ${entry.pkg} missing vendor`).toBeTruthy();
          expect(entry.purpose, `${l.key}: ${entry.pkg} missing purpose`).toBeTruthy();
        }
      }
    });

    it('authLibraries entries have non-empty pkg + strategy + displayName', () => {
      for (const l of getAllLanguages()) {
        for (const entry of l.toolTokens?.authLibraries ?? []) {
          expect(entry.pkg, `${l.key}: authLibraries entry missing pkg`).toBeTruthy();
          expect(entry.strategy, `${l.key}: ${entry.pkg} missing strategy`).toBeTruthy();
          expect(entry.displayName, `${l.key}: ${entry.pkg} missing displayName`).toBeTruthy();
        }
      }
    });

    it('eventQueueLibraries entries have non-empty pkg + pattern + displayName', () => {
      for (const l of getAllLanguages()) {
        for (const entry of l.toolTokens?.eventQueueLibraries ?? []) {
          expect(entry.pkg, `${l.key}: eventQueueLibraries entry missing pkg`).toBeTruthy();
          expect(entry.pattern, `${l.key}: ${entry.pkg} missing pattern`).toBeTruthy();
          expect(entry.displayName, `${l.key}: ${entry.pkg} missing displayName`).toBeTruthy();
        }
      }
    });

    it('no duplicate pkg tokens within a single language family', () => {
      for (const l of getAllLanguages()) {
        for (const category of [
          'externalServiceSdks',
          'authLibraries',
          'eventQueueLibraries',
        ] as const) {
          const entries = l.toolTokens?.[category] ?? [];
          const pkgs = entries.map((e) => (e as { pkg: string }).pkg);
          const seen = new Set<string>();
          for (const pkg of pkgs) {
            expect(seen.has(pkg), `${l.key}.${category} has duplicate pkg '${pkg}'`).toBe(false);
            seen.add(pkg);
          }
        }
      }
    });
  });

  describe('lookups', () => {
    it('getLanguageByKey is case-insensitive', () => {
      expect(getLanguageByKey('TYPESCRIPT')?.key).toBe('typescript');
      expect(getLanguageByKey('typescript')?.key).toBe('typescript');
    });

    it('getLanguageByExtension strips leading dot', () => {
      expect(getLanguageByExtension('.ts')?.key).toBe('typescript');
      expect(getLanguageByExtension('ts')?.key).toBe('typescript');
    });

    it('returns undefined for unknown lookups', () => {
      expect(getLanguageByKey('imaginary')).toBeUndefined();
      expect(getLanguageByExtension('xyzzy')).toBeUndefined();
    });
  });

  describe('aggregated views', () => {
    it('allManifests includes package.json, Cargo.toml, go.mod, *.csproj', () => {
      const kinds = allManifests().map((m) => m.kind);
      expect(kinds).toContain('package.json');
      expect(kinds).toContain('Cargo.toml');
      expect(kinds).toContain('go.mod');
      expect(kinds).toContain('*.csproj');
    });

    it('allLockFiles includes pnpm-lock.yaml, poetry.lock, Cargo.lock', () => {
      const filenames = allLockFiles().map((l) => l.filename);
      expect(filenames).toContain('pnpm-lock.yaml');
      expect(filenames).toContain('poetry.lock');
      expect(filenames).toContain('Cargo.lock');
    });

    it('allRuntimeVersionFiles includes .nvmrc, .python-version, go.mod', () => {
      const filenames = allRuntimeVersionFiles().map((v) => v.filename);
      expect(filenames).toContain('.nvmrc');
      expect(filenames).toContain('.python-version');
      expect(filenames).toContain('go.mod');
    });

    it('allToolTokens(linters) includes eslint, ruff, golangci-lint', () => {
      const linters = allToolTokens('linters');
      expect(linters).toContain('eslint');
      expect(linters).toContain('ruff');
      expect(linters).toContain('golangci-lint');
    });

    it('allToolTokens(formatters) includes prettier, black, gofmt, rustfmt', () => {
      const fmt = allToolTokens('formatters');
      expect(fmt).toContain('prettier');
      expect(fmt).toContain('black');
      expect(fmt).toContain('gofmt');
      expect(fmt).toContain('rustfmt');
    });
  });

  describe('resolvers', () => {
    it('resolveLockFileManager maps lock filenames to manager names', () => {
      expect(resolveLockFileManager('pnpm-lock.yaml')).toBe('pnpm');
      expect(resolveLockFileManager('poetry.lock')).toBe('poetry');
      expect(resolveLockFileManager('Cargo.lock')).toBe('cargo');
      expect(resolveLockFileManager('go.sum')).toBe('go-modules');
      expect(resolveLockFileManager('imaginary.lock')).toBeNull();
    });

    it('resolveManifestEntry resolves exact filenames and *.<ext> suffixes', () => {
      expect(resolveManifestEntry('package.json')?.kind).toBe('package.json');
      expect(resolveManifestEntry('something.csproj')?.kind).toBe('*.csproj');
      expect(resolveManifestEntry('imaginary.toml')).toBeNull();
    });

    it('resolveRuntimeExtractor finds version-pin files', () => {
      const ent = resolveRuntimeExtractor('.nvmrc');
      expect(ent?.key).toBe('node');
      expect(ent?.extract('20.10.0\n')).toBe('20.10.0');
    });

    it('known* helpers return sorted unique lists', () => {
      const lockBasenames = knownLockFileBasenames();
      expect(lockBasenames).toEqual([...lockBasenames].sort());
      const exact = knownExactManifestBasenames();
      expect(exact).toEqual([...exact].sort());
      const suffixes = knownManifestSuffixes();
      expect(suffixes).toEqual([...suffixes].sort());
      const runtimeFiles = knownRuntimeVersionFilenames();
      expect(runtimeFiles).toEqual([...runtimeFiles].sort());
    });

    // Drives the service-completeness validator's discovery surface.
    // Includes wildcard kinds (Xcode / C#) alongside exact filenames;
    // iOS / Android signals must appear.
    it('allManifestPatternsForDiscovery exposes every manifest kind (including mobile)', () => {
      const patterns = allManifestPatternsForDiscovery();
      expect(patterns).toEqual([...patterns].sort());
      expect(new Set(patterns).size).toBe(patterns.length);
      // Mobile signals — load-bearing for mobile-app detection.
      expect(patterns).toContain('AndroidManifest.xml');
      expect(patterns).toContain('Package.swift');
      expect(patterns).toContain('Info.plist');
      expect(patterns).toContain('Podfile');
      expect(patterns).toContain('*.xcodeproj');
      // Plus canonical exact-filename manifests from major language families.
      expect(patterns).toContain('package.json');
      expect(patterns).toContain('pyproject.toml');
      expect(patterns).toContain('go.mod');
      expect(patterns).toContain('Cargo.toml');
      expect(patterns).toContain('Gemfile');
      expect(patterns).toContain('composer.json');
    });
  });

  describe('manifestKindToManagerMap', () => {
    it('maps unambiguous manifest kinds via lock-file count == 1', () => {
      const map = manifestKindToManagerMap();
      expect(map['go.mod']).toBe('go-modules');
      expect(map['Cargo.toml']).toBe('cargo');
      expect(map['composer.json']).toBe('composer');
      expect(map['Gemfile']).toBe('bundler');
      expect(map['mix.exs']).toBe('mix');
      expect(map['*.csproj']).toBe('nuget');
    });

    it('uses per-manifest `manager` when language has multiple managers (java/kotlin)', () => {
      const map = manifestKindToManagerMap();
      expect(map['pom.xml']).toBe('maven');
      expect(map['build.gradle']).toBe('gradle');
      expect(map['build.gradle.kts']).toBe('gradle');
    });

    it('uses `defaultManager` when set (swift)', () => {
      const map = manifestKindToManagerMap();
      expect(map['Package.swift']).toBe('swift-pm');
    });

    it('maps ambiguous manifests via the per-manifest `manager` hint (pyproject.toml → poetry default)', () => {
      const map = manifestKindToManagerMap();
      expect(map['pyproject.toml']).toBe('poetry');
      expect(map['requirements.txt']).toBe('pip');
      expect(map['Pipfile']).toBe('pipenv');
      expect(map['setup.py']).toBe('setuptools');
    });
  });

  describe('registry-derived consumer maps', () => {
    it('languageExtensionsMap covers every registered language', () => {
      const map = languageExtensionsMap();
      for (const lang of getAllLanguages()) {
        expect(map[lang.key], `missing extensions for ${lang.key}`).toBeDefined();
        expect(map[lang.key].length).toBeGreaterThan(0);
      }
    });

    it('languageExtensionsMap prefixes every extension with a leading dot', () => {
      for (const exts of Object.values(languageExtensionsMap())) {
        for (const ext of exts) expect(ext.startsWith('.')).toBe(true);
      }
    });

    it('manifestInfoMap is first-wins across inheritance chains (java/kotlin)', () => {
      const map = manifestInfoMap();
      expect(map['pom.xml']).toEqual({ language: 'java', type: 'maven' });
      expect(map['build.gradle']).toEqual({ language: 'java', type: 'gradle' });
      expect(map['build.gradle.kts']).toEqual({ language: 'java', type: 'gradle' });
    });

    it('primaryManifestFilenames covers every classic workspace root', () => {
      const set = primaryManifestFilenames();
      for (const m of [
        'package.json',
        'go.mod',
        'Cargo.toml',
        'pom.xml',
        'build.gradle',
        'build.gradle.kts',
        'pyproject.toml',
        'requirements.txt',
        'Pipfile',
        'setup.py',
        'Gemfile',
        'composer.json',
        'Package.swift',
        'mix.exs',
        'rebar.config',
        'project.clj',
        'deps.edn',
      ]) {
        expect(set.has(m), `missing ${m}`).toBe(true);
      }
    });

    it('commandDefaultsByLanguage covers every `hasImplementerAgent: true` language', () => {
      const defaults = commandDefaultsByLanguage();
      for (const key of languagesWithImplementerAgent()) {
        expect(defaults[key], `missing commandDefaults for ${key}`).toBeDefined();
      }
    });

    it('utilityLanguageKeys never overlaps with hasImplementerAgent languages', () => {
      const utility = utilityLanguageKeys();
      for (const key of languagesWithImplementerAgent()) {
        expect(utility.has(key), `${key} is both utility and implementer`).toBe(false);
      }
    });

    it('every hasImplementerAgent language has a matching mastering-* skill', () => {
      const fs = require('fs') as typeof import('fs');
      const path = require('path') as typeof import('path');
      const frameworkRoot = path.resolve(__dirname, '..', '..', '..', '..', '..', '..');
      const skillsDir = path.join(frameworkRoot, 'skills', '050-language-frameworks');
      for (const key of languagesWithImplementerAgent()) {
        const candidates = [
          path.join(skillsDir, `mastering-${key}-skill`, 'SKILL.md'),
          path.join(skillsDir, `mastering-${key}`, 'SKILL.md'),
        ];
        const ok = candidates.some((p) => fs.existsSync(p));
        expect(
          ok,
          `'${key}' has hasImplementerAgent: true but no mastering-${key}(-skill)/SKILL.md exists. ` +
            `Either add the skill at one of [${candidates.map((p) => path.relative(frameworkRoot, p)).join(', ')}], ` +
            `or remove hasImplementerAgent from languages/${key}.ts so the language falls through to implementer-generic.`,
        ).toBe(true);
      }
    });
  });

  describe('parseToolVersions', () => {
    it('parses asdf .tool-versions format', () => {
      const body = 'nodejs 20.10.0\npython 3.11.5\n# comment\nruby 3.2.0\n';
      const parsed = parseToolVersions(body);
      expect(parsed.nodejs).toBe('20.10.0');
      expect(parsed.python).toBe('3.11.5');
      expect(parsed.ruby).toBe('3.2.0');
    });
  });

  describe('stack-agnosticism — adding a new language requires NO changes to consumers', () => {
    it('aggregate getAllLanguages includes Crystal, Gleam, Zig (proof the registry is plug-in)', () => {
      const keys = getAllLanguages().map((l) => l.key);
      expect(keys).toContain('crystal');
      expect(keys).toContain('gleam');
      expect(keys).toContain('zig');
    });
  });
});
