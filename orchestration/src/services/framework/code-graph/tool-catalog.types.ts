/**
 * One MCP tool exposed by the local `code-review-graph` server, as the framework
 * sees it in its analyzer prompts. The `name` is the fully-qualified Claude Code
 * MCP tool name (e.g. `mcp__code_graph__list_communities_tool`); the
 * `description` is the server-provided short string used to help the agent pick
 * the right tool.
 */
export interface CodeGraphTool {
  name: string;
  description: string;
}
