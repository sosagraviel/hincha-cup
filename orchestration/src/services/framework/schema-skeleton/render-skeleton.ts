/**
 * Render a Zod schema as a JSONC skeleton for prompt injection.
 * The analyzer prompts derive their "expected output" section from the
 * same Zod schema the Stop hook validates against — no drift possible.
 *
 * Output format:
 *   - Optional fields use `"<key>?"` so the agent OMITS them when
 *     no value (vs. emitting `null`, which Zod `.optional()` rejects).
 *   - Required fields appear without `?`.
 *   - Literal values render as JSON-stringified values.
 *   - Enums render as `"a|b|c"` (the literal Zod vocabulary).
 *   - Constraints (min/max length, min/max items, ≤N chars) render
 *     as JSONC line-end comments.
 *   - `z.never()` (FORBIDDEN keys) render as a `// "<key>": FORBIDDEN`
 *     comment line, never as an emittable field.
 *   - Records render as `{ "<key>": <value> }`.
 *   - Unions render as `<a> | <b>`.
 *
 * Pure function — no I/O, no globals. Caller wraps the output in a
 * fenced code block.
 */

import { z, type ZodType } from 'zod';

const INDENT = '  ';

interface JsonSchemaNode {
  type?: string | string[];
  const?: unknown;
  enum?: unknown[];
  properties?: Record<string, JsonSchemaNode>;
  required?: string[];
  items?: JsonSchemaNode | JsonSchemaNode[];
  additionalProperties?: JsonSchemaNode | boolean;
  propertyNames?: JsonSchemaNode;
  minItems?: number;
  maxItems?: number;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  not?: JsonSchemaNode;
  anyOf?: JsonSchemaNode[];
  oneOf?: JsonSchemaNode[];
  default?: unknown;
  description?: string;
}

const pad = (depth: number): string => INDENT.repeat(depth);

/**
 * `z.never()` renders as `{ "not": {} }`. Used to mark FORBIDDEN keys.
 */
function isForbidden(node: JsonSchemaNode): boolean {
  return !!(node.not && Object.keys(node.not).length === 0);
}

function isEmptyShape(node: JsonSchemaNode): boolean {
  const ownKeys = Object.keys(node).filter((k) => k !== 'description');
  return ownKeys.length === 0;
}

function renderConstraintComment(parts: string[]): string {
  return parts.length > 0 ? `  // ${parts.join(', ')}` : '';
}

function describeStringConstraints(node: JsonSchemaNode): string {
  const parts: string[] = [];
  if (node.minLength != null && node.minLength > 0) parts.push(`≥${node.minLength}`);
  if (node.maxLength != null) parts.push(`≤${node.maxLength}`);
  return parts.length ? ' ' + parts.join(', ') : '';
}

function renderNode(node: JsonSchemaNode | undefined, depth: number): string {
  if (!node) return '<any>';
  if (isForbidden(node)) return '<FORBIDDEN>';

  if ('const' in node && node.const !== undefined) {
    return JSON.stringify(node.const);
  }

  if (Array.isArray(node.enum) && node.enum.length > 0) {
    return `"${node.enum.map(String).join('|')}"`;
  }

  if (isEmptyShape(node)) {
    return '"<string>"';
  }

  const variants = node.anyOf ?? node.oneOf;
  if (variants && variants.length > 0) {
    return variants.map((v) => renderNode(v, depth)).join(' | ');
  }

  if (node.type === 'string') {
    return `"<string${describeStringConstraints(node)}>"`;
  }

  if (node.type === 'integer') return '<int>';
  if (node.type === 'number') return '<number>';

  if (node.type === 'boolean') return '<bool>';

  if (node.type === 'array') {
    const items = Array.isArray(node.items) ? node.items[0] : node.items;
    return `[${renderNode(items, depth)}]`;
  }

  if (
    node.type === 'object' &&
    (!node.properties || Object.keys(node.properties).length === 0) &&
    node.additionalProperties &&
    typeof node.additionalProperties === 'object'
  ) {
    return `{ "<key>": ${renderNode(node.additionalProperties, depth)} }`;
  }

  if (node.type === 'object' && node.properties) {
    return renderObject(node, depth);
  }

  return '<any>';
}

function renderObject(node: JsonSchemaNode, depth: number): string {
  const props = node.properties ?? {};
  const required = new Set(node.required ?? []);
  const lines: Array<{ body: string; tail: string } | { raw: string }> = [];

  for (const [key, propSchema] of Object.entries(props)) {
    if (isForbidden(propSchema)) {
      lines.push({ raw: `${pad(depth + 1)}// "${key}": FORBIDDEN — see analyzer rule` });
      continue;
    }

    const optional = !required.has(key);
    const renderedKey = optional ? `"${key}?"` : `"${key}"`;
    const rendered = renderNode(propSchema, depth + 1);

    const constraints: string[] = [];
    if (propSchema.type === 'array') {
      if (propSchema.minItems != null && propSchema.minItems > 0) {
        constraints.push(`≥${propSchema.minItems}`);
      }
      if (propSchema.maxItems != null) {
        constraints.push(`≤${propSchema.maxItems}`);
      }
    }
    lines.push({
      body: `${pad(depth + 1)}${renderedKey}: ${rendered}`,
      tail: renderConstraintComment(constraints),
    });
  }

  if (lines.length === 0) return '{}';
  const lastFieldIdx = (() => {
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!('raw' in lines[i])) return i;
    }
    return -1;
  })();
  const renderedLines = lines.map((l, i) => {
    if ('raw' in l) return l.raw;
    const isLast = i === lastFieldIdx;
    return `${l.body}${isLast ? '' : ','}${l.tail}`;
  });
  return `{\n${renderedLines.join('\n')}\n${pad(depth)}}`;
}

/**
 * Render a Zod schema as a JSONC skeleton string. The returned text
 * is meant to be embedded inside a ```jsonc fenced code block in a
 * prompt; the function does NOT add the fence itself.
 */
export function renderSchemaSkeleton(schema: ZodType): string {
  const jsonSchema = z.toJSONSchema(schema, {
    reused: 'inline',
    unrepresentable: 'any',
  }) as JsonSchemaNode;
  return renderNode(jsonSchema, 0);
}
