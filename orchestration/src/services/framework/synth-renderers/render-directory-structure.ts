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
    file_placement_patterns?: Array<{ type: string; location: string; example: string }>;
  }>;
}

/** Soft cap on rendered tree lines, honouring the spec's 5–15 line band. */
const MAX_TREE_LINES = 15;

export function renderDirectoryStructureMarkdown(input: DirStructureInput): string {
  const allServices = input.services ?? [];
  const services = allServices.filter(
    (s) => typeof s.path === 'string' && s.path !== '.' && s.path !== '',
  );

  if (services.length === 0) {
    const tree = deriveTreeFromPlacements(allServices);
    const body =
      tree.length > 0 ? tree : ['└── (layout not determined — see File Placement Guide)'];
    return ['## Directory Structure', '', '```', `${input.projectName}/`, ...body, '```', ''].join(
      '\n',
    );
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

interface DerivedNode {
  types: Set<string>;
  children: Map<string, Set<string>>;
}

/**
 * Derive a top-level annotated tree from the grounded
 * `file_placement_patterns` of services that have no distinct path (the
 * single-repo / root-service case the path-based branch can't render).
 * Groups pattern locations by their first two directory segments and
 * annotates each node with the distinct pattern `type`s observed under it.
 * Returns the inner tree lines (no fence / heading); empty when no usable
 * patterns exist.
 */
function deriveTreeFromPlacements(services: NonNullable<DirStructureInput['services']>): string[] {
  const topLevels = new Map<string, DerivedNode>();
  for (const svc of services) {
    for (const pattern of svc.file_placement_patterns ?? []) {
      const segments = directorySegments(pattern.location);
      if (segments.length === 0) continue;
      const top = segments[0];
      if (!topLevels.has(top)) topLevels.set(top, { types: new Set(), children: new Map() });
      const node = topLevels.get(top)!;
      const second = segments[1];
      if (second && !isPlaceholderSegment(second)) {
        if (!node.children.has(second)) node.children.set(second, new Set());
        node.children.get(second)!.add(pattern.type);
      } else {
        node.types.add(pattern.type);
      }
    }
  }

  const tops = Array.from(topLevels.keys()).sort();
  if (tops.length === 0) return [];

  const lines: string[] = [];
  let truncated = false;
  tops.forEach((top, idx) => {
    if (lines.length >= MAX_TREE_LINES) {
      truncated = true;
      return;
    }
    const isLastTop = idx === tops.length - 1;
    const node = topLevels.get(top)!;
    const childNames = Array.from(node.children.keys()).sort();

    if (childNames.length === 0) {
      lines.push(`${isLastTop ? '└──' : '├──'} ${top}/${annotate(node.types)}`);
      return;
    }

    lines.push(`${isLastTop ? '└──' : '├──'} ${top}/`);
    childNames.forEach((child, cidx) => {
      if (lines.length >= MAX_TREE_LINES) {
        truncated = true;
        return;
      }
      const isLastChild = cidx === childNames.length - 1;
      const branch = isLastTop ? '    ' : '│   ';
      const leaf = isLastChild ? '└──' : '├──';
      lines.push(`${branch}${leaf} ${child}/${annotate(node.children.get(child)!)}`);
    });
  });

  if (truncated) lines.push('… (truncated — see File Placement Guide)');
  return lines;
}

/**
 * Reduce a placement `location` to its directory segments: split on `/`,
 * drop empty segments, and drop a trailing filename (any segment carrying a
 * `.` extension, including templated ones like `{domain}.py` or `*.py`).
 */
function directorySegments(location: string): string[] {
  const segments = location.split('/').filter((s) => s.length > 0);
  if (segments.length === 0) return [];
  if (segments[segments.length - 1].includes('.')) segments.pop();
  return segments;
}

function isPlaceholderSegment(segment: string): boolean {
  return segment.includes('{') || segment.includes('*') || segment.includes('<');
}

/**
 * Render a `  # type, type, …` annotation from a set of pattern types,
 * capped to keep tree lines scannable. Empty set → empty string.
 */
function annotate(types: Set<string>): string {
  if (types.size === 0) return '';
  let text = Array.from(types).slice(0, 4).join(', ');
  if (text.length > 60) text = `${text.slice(0, 57)}…`;
  return `  # ${text}`;
}
