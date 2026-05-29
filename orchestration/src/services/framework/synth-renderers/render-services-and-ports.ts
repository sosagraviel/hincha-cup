/**
 * Deterministic `## Services & Ports` section renderer. Produces a
 * four-column table (Service | Type | Port | Role) from the curated
 * synthesis bundle:
 *   - `summary.services[]` (source-code services)
 *   - `summary.infrastructure_services[]` (runtime infra)
 *
 * Source-code rows first; infra rows after. SaaS-with-no-localhost-port
 * entries render `— (<reason>)`. Library / CLI service types render
 * `— (library — no runtime)` / `— (CLI — no runtime)` since they don't
 * own a port.
 */

interface ServiceRow {
  id?: string;
  name?: string;
  type?: string;
  language?: string;
  framework_main?: string;
  port?: number;
  port_applies?: boolean;
  port_applies_reason?: string;
  role?: string;
}

interface InfraRow {
  id?: string;
  name?: string;
  type?: string;
  port?: number;
  port_applies?: boolean;
  port_applies_reason?: string;
  role?: string;
}

interface ServicesPortsInput {
  services?: ServiceRow[];
  infrastructure_services?: InfraRow[];
}

export function renderServicesAndPortsMarkdown(input: ServicesPortsInput): string {
  const sourceServices = input.services ?? [];
  const infraServices = input.infrastructure_services ?? [];

  if (sourceServices.length === 0 && infraServices.length === 0) {
    return '';
  }

  const out: string[] = [
    '## Services & Ports',
    '',
    '| Service | Type | Port | Role |',
    '| ------- | ---- | ---- | ---- |',
  ];

  for (const svc of sourceServices) {
    const id = svc.id ?? svc.name ?? '—';
    const type = svc.type ?? '—';
    const port = formatPort(svc.port, svc.port_applies, svc.port_applies_reason, svc.type);
    const role = svc.role ?? deriveServiceRole(svc);
    out.push(`| ${escape(id)} | ${escape(type)} | ${escape(port)} | ${escape(role)} |`);
  }

  for (const infra of infraServices) {
    const id = infra.id ?? infra.name ?? '—';
    const type = infra.type ?? '—';
    const port = formatPort(infra.port, infra.port_applies, infra.port_applies_reason, infra.type);
    const role = infra.role ?? infra.name ?? id;
    out.push(`| ${escape(id)} | ${escape(type)} | ${escape(port)} | ${escape(role)} |`);
  }

  return out.join('\n') + '\n';
}

function formatPort(
  port: number | undefined,
  portApplies: boolean | undefined,
  reason: string | undefined,
  serviceType: string | undefined,
): string {
  if (typeof port === 'number' && port > 0) {
    return String(port);
  }
  if (portApplies === false) {
    return `— (${(reason ?? 'no localhost port').trim()})`;
  }
  const t = (serviceType ?? '').toLowerCase();
  if (t === 'library' || t === 'lib') return '— (library — no runtime)';
  if (t === 'cli') return '— (CLI — no runtime)';
  if (t === 'infrastructure') return '—';
  return '—';
}

function deriveServiceRole(svc: ServiceRow): string {
  const parts: string[] = [];
  if (svc.framework_main) parts.push(cleanFramework(svc.framework_main));
  if (svc.type && svc.type !== 'service') parts.push(svc.type);
  if (svc.language && parts.length === 0) parts.push(svc.language);
  return parts.length > 0 ? parts.join(' ') : (svc.id ?? svc.name ?? '—');
}

function cleanFramework(raw: string): string {
  return raw.replace(/[\s^~>=<].*$/, '').replace(/^@[^/]+\//, '');
}

function escape(s: string): string {
  return s.replace(/\|/g, '\\|').replace(/\n+/g, ' ');
}
