export interface CodexMcpServer {
  command: string;
  args: string[];
}

export interface ParsedCodexMcpServer {
  command?: string;
  args?: string[];
}

const CODE_GRAPH_MCP_TABLE = 'mcp_servers.code_graph';

export function renderCodeGraphMcpTomlBlock(server: CodexMcpServer): string {
  const args = server.args.map((arg) => `"${escapeTomlString(arg)}"`).join(', ');
  return [
    `[${CODE_GRAPH_MCP_TABLE}]`,
    `command = "${escapeTomlString(server.command)}"`,
    `args = [${args}]`,
    '',
  ].join('\n');
}

export function upsertCodeGraphMcpTomlBlock(content: string, server: CodexMcpServer): string {
  return appendTomlBlock(removeCodeGraphMcpTomlBlock(content), renderCodeGraphMcpTomlBlock(server));
}

export function extractCodeGraphMcpTomlServer(content: string): ParsedCodexMcpServer | undefined {
  const lines = content.split('\n');
  const start = findCodeGraphMcpBlockStart(lines);
  if (start === -1) return undefined;

  const blockLines: string[] = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const tableName = parseTomlTableName(lines[i]);
    if (
      tableName &&
      tableName !== CODE_GRAPH_MCP_TABLE &&
      !tableName.startsWith(`${CODE_GRAPH_MCP_TABLE}.`)
    ) {
      break;
    }
    blockLines.push(lines[i]);
  }

  const block = blockLines.join('\n');
  return {
    command: parseTomlStringValue(block, 'command'),
    args: parseTomlStringArrayValue(block, 'args'),
  };
}

export function codexMcpServerMatches(
  actual: ParsedCodexMcpServer | undefined,
  expected: CodexMcpServer,
): boolean {
  return (
    actual?.command === expected.command &&
    Array.isArray(actual.args) &&
    actual.args.length === expected.args.length &&
    actual.args.every((arg, index) => arg === expected.args[index])
  );
}

/**
 * Remove the `[mcp_servers.code_graph]` table (and its body) from a TOML
 * document. Returns the original content unchanged when the block is absent.
 *
 * Exported because the portability housekeeping (Phase 6) needs to strip
 * absolute-path-bearing args before the validator scans committed files.
 */
export function removeCodeGraphMcpTomlBlock(content: string): string {
  const lines = content.split('\n');
  const start = findCodeGraphMcpBlockStart(lines);
  if (start === -1) return content;

  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    const tableName = parseTomlTableName(lines[i]);
    if (
      tableName &&
      tableName !== CODE_GRAPH_MCP_TABLE &&
      !tableName.startsWith(`${CODE_GRAPH_MCP_TABLE}.`)
    ) {
      end = i;
      break;
    }
  }

  return [...lines.slice(0, start), ...lines.slice(end)].join('\n');
}

function appendTomlBlock(content: string, block: string): string {
  const trimmedEnd = content.trimEnd();
  return trimmedEnd ? `${trimmedEnd}\n\n${block}` : block;
}

function findCodeGraphMcpBlockStart(lines: string[]): number {
  return lines.findIndex((line) => parseTomlTableName(line) === CODE_GRAPH_MCP_TABLE);
}

function parseTomlTableName(line: string): string | undefined {
  const match = line.match(/^\s*\[([^\]]+)\]\s*(?:#.*)?$/);
  return match?.[1]?.trim();
}

function parseTomlStringValue(block: string, key: string): string | undefined {
  const match = block.match(
    new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*"((?:[^"\\\\]|\\\\.)*)"`, 'm'),
  );
  return match ? unescapeTomlString(match[1]) : undefined;
}

function parseTomlStringArrayValue(block: string, key: string): string[] | undefined {
  // Match both single-line `args = ["a", "b"]` and multi-line `args = [\n  "a",\n  "b",\n]`.
  const match = block.match(new RegExp(`^\\s*${escapeRegExp(key)}\\s*=\\s*\\[([^\\]]*)\\]`, 'ms'));
  if (!match) return undefined;

  const values: string[] = [];
  const valuePattern = /"((?:[^"\\]|\\.)*)"/g;
  let valueMatch: RegExpExecArray | null;
  while ((valueMatch = valuePattern.exec(match[1])) !== null) {
    values.push(unescapeTomlString(valueMatch[1]));
  }
  return values;
}

function escapeTomlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function unescapeTomlString(value: string): string {
  return value.replace(/\\(["\\])/g, '$1');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
