import type { LanguageConfig } from '../types.js';

/**
 * VB.NET — shares the .NET toolchain (NuGet / dotnet CLI). The
 * `packages.lock.json` lock file lives on `csharp.ts` and applies to
 * every .NET project regardless of language.
 */
export const vbnet: LanguageConfig = {
  key: 'vbnet',
  displayName: 'VB.NET',
  extensions: ['vb'],
  manifests: [{ kind: '*.vbproj', format: 'xml' }],
  lockFiles: [{ filename: 'packages.lock.json', manager: 'nuget' }],
  commandDefaults: {
    lint: 'dotnet format --verify-no-changes',
    format: 'dotnet format',
    typecheck: 'dotnet build --no-incremental',
    test: 'dotnet test',
    build: 'dotnet build',
  },
};
