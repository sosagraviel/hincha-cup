import type { LanguageConfig } from '../types.js';

/**
 * F# — shares the .NET toolchain (NuGet / dotnet CLI). The
 * `packages.lock.json` lock file is declared on `csharp.ts` and applies
 * to any .NET project regardless of language; declaring it again here
 * would duplicate the entry.
 */
export const fsharp: LanguageConfig = {
  key: 'fsharp',
  displayName: 'F#',
  extensions: ['fs', 'fsx', 'fsi'],
  manifests: [{ kind: '*.fsproj', format: 'xml' }],
  lockFiles: [{ filename: 'packages.lock.json', manager: 'nuget' }],
  commandDefaults: {
    lint: 'dotnet format --verify-no-changes',
    format: 'dotnet format',
    typecheck: 'dotnet build --no-incremental',
    test: 'dotnet test',
    build: 'dotnet build',
  },
};
