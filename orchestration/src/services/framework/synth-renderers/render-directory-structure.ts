/**
 * Deterministic `## Directory Structure` section renderer. Produces an
 * annotated top-level tree of the project's services + root-level config
 * files.
 *
 * Inputs:
 *   - `summary.services[]` (with `path` + brief `role` / `type`)
 *   - the project's root path (just for display)
 *
 * The renderer keeps the tree to TOP-LEVEL only — no recursion into
 * service internals.
 *
 * Stack-agnostic — no hardcoded service / framework / language names;
 * service entries come straight from the analyzer-discovered list.
 */

interface DirStructureInput {
  projectName: string;
  services?: Array<{
    id?: string;
    name?: string;
    path?: string;
    type?: string;
    framework_main?: string;
  }>;
}

export function renderDirectoryStructureMarkdown(input: DirStructureInput): string {
  const services = (input.services ?? []).filter(
    (s) => typeof s.path === 'string' && s.path !== '.' && s.path !== '',
  );

  if (services.length === 0) {
    return [
      '## Directory Structure',
      '',
      '```',
      `${input.projectName}/`,
      '└── (single-service / polyrepo — see service docs for layout)',
      '```',
      '',
    ].join('\n');
  }

  const groups = new Map<string, typeof services>();
  for (const svc of services) {
    const path = svc.path!;
    const slash = path.indexOf('/');
    const topLevel = slash > 0 ? path.slice(0, slash) : path;
    const arr = groups.get(topLevel) ?? [];
    arr.push(svc);
    groups.set(topLevel, arr);
  }

  const lines: string[] = ['## Directory Structure', '', '```', `${input.projectName}/`];

  const topLevels = Array.from(groups.keys()).sort();
  topLevels.forEach((topLevel, idx) => {
    const isLastGroup = idx === topLevels.length - 1;
    const groupServices = groups.get(topLevel)!;

    if (groupServices.length === 1 && groupServices[0].path === topLevel) {
      const svc = groupServices[0];
      const role = describeService(svc);
      lines.push(`${isLastGroup ? '└──' : '├──'} ${topLevel}/${pad(role)}`);
    } else {
      lines.push(`${isLastGroup ? '└──' : '├──'} ${topLevel}/`);
      groupServices.forEach((svc, sidx) => {
        const isLastSvc = sidx === groupServices.length - 1;
        const branch = isLastGroup ? '    ' : '│   ';
        const leaf = isLastSvc ? '└──' : '├──';
        const leafName = svc.path!.startsWith(topLevel + '/')
          ? svc.path!.slice(topLevel.length + 1)
          : (svc.id ?? svc.name ?? svc.path);
        lines.push(`${branch}${leaf} ${leafName}/${pad(describeService(svc))}`);
      });
    }
  });

  lines.push('```', '');
  return lines.join('\n');
}

function describeService(svc: {
  id?: string;
  name?: string;
  type?: string;
  framework_main?: string;
}): string {
  const parts: string[] = [];
  if (svc.framework_main) {
    parts.push(cleanFramework(svc.framework_main));
  }
  if (svc.type) parts.push(svc.type);
  return parts.length > 0 ? parts.join(' ') : '';
}

function pad(annotation: string): string {
  if (!annotation) return '';
  return `   ${annotation}`;
}

function cleanFramework(raw: string): string {
  return raw.replace(/[\s^~>=<].*$/, '').replace(/^@[^/]+\//, '');
}
