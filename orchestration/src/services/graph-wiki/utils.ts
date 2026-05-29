export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isEmptyValue(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    value === '' ||
    (Array.isArray(value) && value.length === 0) ||
    (isRecord(value) && Object.keys(value).length === 0)
  );
}

export function asStringArray(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function normalizeKey(key: string): string {
  return key.replace(/[_\-\s]/g, '').toLowerCase();
}

export function findValueByKey(value: unknown, targetKey: string): unknown {
  if (!isRecord(value)) {
    return undefined;
  }
  if (Object.prototype.hasOwnProperty.call(value, targetKey)) {
    return value[targetKey];
  }

  const normalizedTarget = normalizeKey(targetKey);
  for (const [key, entryValue] of Object.entries(value)) {
    if (normalizeKey(key) === normalizedTarget) {
      return entryValue;
    }
    const nested = findValueByKey(entryValue, targetKey);
    if (nested !== undefined) {
      return nested;
    }
  }

  return undefined;
}

export function slugifyServiceId(serviceId: string): string {
  const slug = serviceId
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'service';
}

export function ensureTrailingNewline(content: string): string {
  return content.endsWith('\n') ? content : `${content}\n`;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function stableJsonStringify(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function relativeGraphPath(graphPath: string): string {
  const suffix = '/.code-review-graph/graph.db';
  return graphPath.endsWith(suffix) ? '.code-review-graph/graph.db' : graphPath;
}
