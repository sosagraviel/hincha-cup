import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { PromptScriptHandler } from '../types.js';

/**
 * Renders a compact summary of project-inspection.json that the agent
 * can consume without an extra Read call. Stack-agnostic — every
 * field is read verbatim from inspection.
 */
export const inspectionSummary: PromptScriptHandler = {
  name: 'inspection-summary',
  description:
    'Compact summary of Phase 0 project-inspection.json — services, runtimes, infra, ports.',
  run(_args, ctx) {
    const path = join(ctx.tempDir, 'project-inspection.json');
    if (!existsSync(path)) {
      return '<!-- inspection-summary: project-inspection.json missing -->';
    }
    let inspection: Record<string, unknown>;
    try {
      inspection = JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      return '<!-- inspection-summary: project-inspection.json unparseable -->';
    }

    const lines: string[] = ['### Project inspection (Phase 0 deterministic facts)', ''];

    const repoType = inspection.repository_type;
    if (typeof repoType === 'string') {
      lines.push(`- Repository type: \`${repoType}\``);
    }
    const monorepo = inspection.monorepo as Record<string, unknown> | undefined;
    if (monorepo && typeof monorepo === 'object') {
      const tool = monorepo.workspace_tool ?? monorepo.tool;
      const pm = monorepo.package_manager;
      if (tool) lines.push(`- Workspace tool: \`${String(tool)}\``);
      if (pm) lines.push(`- Workspace package manager: \`${String(pm)}\``);
    }

    const runtimes = inspection.runtime_versions as Record<string, string> | undefined;
    if (runtimes && Object.keys(runtimes).length > 0) {
      const entries = Object.entries(runtimes)
        .filter(([k]) => k !== 'tool-versions-raw')
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      if (entries) lines.push(`- Runtime versions: ${entries}`);
    }

    const manifests = inspection.manifests as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(manifests) && manifests.length > 0) {
      const kinds = Array.from(new Set(manifests.map((m) => String(m.kind))));
      lines.push(`- Manifest kinds: ${kinds.map((k) => `\`${k}\``).join(', ')}`);
    }

    const lockFiles = inspection.lock_files as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(lockFiles) && lockFiles.length > 0) {
      const managers = Array.from(new Set(lockFiles.map((l) => String(l.manager)).filter(Boolean)));
      lines.push(`- Lock-file managers: ${managers.map((m) => `\`${m}\``).join(', ')}`);
    }

    const infra = inspection.infrastructure as string[] | undefined;
    if (Array.isArray(infra) && infra.length > 0) {
      lines.push(`- Infrastructure tools: ${infra.map((i) => `\`${i}\``).join(', ')}`);
    }

    const ciCd = inspection.ci_cd as Record<string, unknown> | undefined;
    if (ciCd && typeof ciCd.provider === 'string') {
      lines.push(`- CI/CD: ${ciCd.provider}`);
    }

    const env = inspection.environment as Record<string, unknown> | undefined;
    if (env && Array.isArray(env.required_vars) && env.required_vars.length > 0) {
      lines.push(`- Environment vars (template): ${env.required_vars.length}`);
    }

    const hints = inspection.infrastructure_services_hints as
      | Array<Record<string, unknown>>
      | undefined;
    if (Array.isArray(hints) && hints.length > 0) {
      lines.push('');
      lines.push('Infrastructure-service hints (`{name, port, source_file}`):');
      for (const h of hints.slice(0, 12)) {
        lines.push(`  - \`${String(h.name)}\` → port ${h.port} (\`${h.source_file}\`)`);
      }
    }

    lines.push('');
    lines.push(
      'Full structured data: `<tempDir>/project-inspection.json` (read only when this summary is insufficient).',
    );
    return lines.join('\n');
  },
};
