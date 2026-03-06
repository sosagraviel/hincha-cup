---
name: notion-document-manager
description: Manage Notion documents with smart chunking for large pages, efficient search, and batch operations. Use when reading/writing Notion docs, searching Notion, or syncing documentation.
user-invocable: true
disable-model-invocation: false
allowed-tools: Read, Write, Bash(python3 *)
---

# Notion Document Manager

Comprehensive skill for working with Notion documents through the Notion MCP server, including intelligent handling of large documents, efficient search, and batch operations.

## Prerequisites

- **Notion MCP**: Configured globally (OAuth authenticated)
- **Notion AI**: Required for `search_notion` functionality
- **Python 3.8+**: For chunking and composition scripts

## Core Capabilities

### 1. Read Notion Pages (Any Size)

**For standard pages (< 50KB):**
```bash
# Direct fetch
mcp__notion__fetch_page --url "https://notion.so/page-id"
```

**For large pages (> 50KB):**
Uses pagination with automatic chunking:
1. Fetch page with cursor
2. Store chunks in temporary file
3. Continue until cursor is null
4. Compose full document locally

**Implementation:**
```python
# Automatic chunking handled by skill
# Temp file: /tmp/notion_${SESSION_ID}_${page_id}.md
```

### 2. Search Notion Efficiently

**Rate Limit:** 30 searches per minute

**Best Practices:**
- Use specific search terms (not broad queries)
- Cache results locally for repeated searches
- Batch searches when possible

**Search Pattern:**
```bash
# Search with caching
search_query="API authentication design"
mcp__notion__search_notion --query "$search_query"

# Cache result for 1 hour
# Subsequent searches within 1 hour use cached result
```

### 3. Create and Update Pages

**Create new page:**
```bash
mcp__notion__create_page \
  --parent_page_id "parent-id" \
  --title "New Design Doc" \
  --properties '{"Status": "Draft"}' \
  --content_markdown "# Introduction\n\nContent here..."
```

**Update existing page:**
```bash
mcp__notion__update_page \
  --page_id "page-id" \
  --properties '{"Status": "In Review"}' \
  --content_markdown "Updated content..."
```

### 4. Handle Large Documents

When reading pages > 50KB, the skill automatically:

**Step 1: Detect size**
- First chunk reveals total size
- If > 50KB, switch to chunking mode

**Step 2: Fetch with pagination**
```python
cursor = None
chunks = []

while True:
    result = fetch_page(page_id, cursor=cursor)
    chunks.append(result["content"])
    cursor = result.get("pagination", {}).get("next_cursor")
    if not cursor:
        break
    time.sleep(0.5)  # Rate limit compliance
```

**Step 3: Compose locally**
```bash
temp_file="/tmp/notion_${CLAUDE_SESSION_ID}_${page_id}.md"
for chunk in chunks:
    echo "$chunk" >> "$temp_file"
    echo -e "\n---\n" >> "$temp_file"
done
```

**Step 4: Process full document**
- Read from temp file
- Analyze without re-fetching
- Clean up when done

## Common Workflows

### Workflow 1: Import Notion Doc for Context

**Use Case:** Read a Notion page to understand requirements

```bash
# Step 1: Fetch page
page_url="https://notion.so/Design-Spec-abc123"
content=$(mcp__notion__fetch_page --url "$page_url")

# Step 2: If large, chunks are auto-handled
# Check if chunking was needed
if [[ -f "/tmp/notion_${CLAUDE_SESSION_ID}_*.md" ]]; then
    echo "Large doc detected, reading from composed file"
    cat /tmp/notion_${CLAUDE_SESSION_ID}_*.md
else
    echo "Standard doc, content ready"
    echo "$content"
fi

# Step 3: Extract key sections
# Parse Markdown headings and content
```

### Workflow 2: Search and Read Multiple Docs

**Use Case:** Find all design docs related to "authentication"

```bash
# Step 1: Search (respects 30/min limit)
results=$(mcp__notion__search_notion --query "authentication design")

# Step 2: Extract page IDs from results
page_ids=$(echo "$results" | jq -r '.results[].id')

# Step 3: Read each page
for page_id in $page_ids; do
    echo "Reading page: $page_id"
    mcp__notion__fetch_page --page_id "$page_id"
    sleep 2  # Rate limit: 3 req/sec
done
```

### Workflow 3: Create Documentation from Code

**Use Case:** Generate Notion doc from implementation

```bash
# Step 1: Analyze code
code_summary=$(analyze_codebase)

# Step 2: Format as Markdown
markdown=$(cat <<EOF
# Implementation Summary

## Overview
$code_summary

## Key Files
- src/auth/handler.ts
- src/auth/middleware.ts

## Testing
All unit tests passing, coverage: 87%
EOF
)

# Step 3: Create Notion page
mcp__notion__create_page \
  --parent_page_id "$DOCS_PARENT_ID" \
  --title "Auth Implementation - $(date +%Y-%m-%d)" \
  --content_markdown "$markdown"
```

### Workflow 4: Sync Changes Back to Notion

**Use Case:** Update status after PR merge

```bash
# Step 1: Get page ID from ticket metadata
page_id=$(extract_notion_link_from_ticket)

# Step 2: Update status property
mcp__notion__update_page \
  --page_id "$page_id" \
  --properties '{"Status": "Completed", "PR": "https://github.com/..."}'

# Step 3: Add completion comment
mcp__notion__create_comment \
  --page_id "$page_id" \
  --text "✅ Implementation completed. PR merged to main."
```

## Error Handling

### Rate Limit (429)
```bash
if [[ "$response" == *"429"* ]]; then
    echo "⚠️  Rate limit hit. Waiting 60 seconds..."
    sleep 60
    # Retry
fi
```

### Permission Error (403)
```bash
if [[ "$response" == *"403"* ]]; then
    echo "❌ Permission denied"
    echo "Grant bot access in Notion settings:"
    echo "Settings → Connections → Notion MCP → Share with [your-page]"
    exit 1
fi
```

### Page Not Found (404)
```bash
if [[ "$response" == *"404"* ]]; then
    echo "❌ Page not found"
    echo "Verify page URL or ID is correct"
    echo "Check if page was deleted"
    exit 1
fi
```

### Network Timeout
```bash
retries=3
for i in $(seq 1 $retries); do
    if timeout 30 mcp__notion__fetch_page --page_id "$page_id"; then
        break
    fi
    if [[ $i -lt $retries ]]; then
        echo "Retry $i/$retries after 5s..."
        sleep 5
    else
        echo "❌ Network timeout after $retries retries"
        exit 1
    fi
done
```

## Best Practices

### 1. Cache Search Results
```bash
# Cache file per query
cache_dir="$HOME/.cache/notion_searches"
mkdir -p "$cache_dir"

cache_file="$cache_dir/$(echo -n "$query" | md5).json"

if [[ -f "$cache_file" ]] && [[ $(find "$cache_file" -mmin -60) ]]; then
    # Cache hit (within 1 hour)
    cat "$cache_file"
else
    # Cache miss
    result=$(mcp__notion__search_notion --query "$query")
    echo "$result" > "$cache_file"
    echo "$result"
fi
```

### 2. Batch Operations
```bash
# Instead of: Create 10 pages separately (slow)
# Do: Batch create (if supported by MCP)

pages=(
    "Design Doc 1"
    "Design Doc 2"
    "Design Doc 3"
)

for title in "${pages[@]}"; do
    mcp__notion__create_page --title "$title" --parent_page_id "$parent"
    sleep 0.5  # Rate limit: 2/sec
done
```

### 3. Clean Up Temp Files
```bash
# At end of workflow
cleanup_notion_temp_files() {
    find /tmp -name "notion_${CLAUDE_SESSION_ID}_*.md" -delete
    echo "✓ Cleaned up temporary Notion files"
}

trap cleanup_notion_temp_files EXIT
```

### 4. Token-Aware Reading
```bash
# For large docs, estimate tokens before processing
estimate_tokens() {
    local content="$1"
    local char_count=${#content}
    # Rough estimate: 4 chars per token
    echo $((char_count / 4))
}

page_content=$(mcp__notion__fetch_page --page_id "$page_id")
tokens=$(estimate_tokens "$page_content")

if [[ $tokens -gt 10000 ]]; then
    echo "⚠️  Large document: ~$tokens tokens"
    echo "Consider reading in sections"
fi
```

## Integration with Other Skills

### With Jira Skill
```bash
# Read Notion docs linked in Jira ticket
ticket_links=$(mcp__atlassian__getJiraIssue --issue_key "PROJ-123" | jq -r '.fields.description' | grep 'notion.so')

for notion_url in $ticket_links; do
    echo "Reading linked Notion doc: $notion_url"
    mcp__notion__fetch_page --url "$notion_url"
done
```

### With Confluence Skill
```bash
# Sync Notion to Confluence
notion_content=$(mcp__notion__fetch_page --page_id "$notion_page")
mcp__atlassian__createConfluencePage \
    --space_key "DEV" \
    --title "Synced from Notion" \
    --content "$notion_content"
```

### With PR Creation
```bash
# Include Notion docs in PR description
notion_spec=$(mcp__notion__fetch_page --page_id "$spec_id")

pr_body="## Specification
[View in Notion](https://notion.so/$spec_id)

$notion_spec

## Implementation
..."

gh pr create --body "$pr_body"
```

## Troubleshooting

**Issue: "Notion MCP not configured"**
```bash
# Verify MCP connection
echo "Checking Notion MCP..."
if ! command -v mcp__notion__fetch_page &> /dev/null; then
    echo "❌ Notion MCP not available"
    echo "Configure in Claude Code settings"
    exit 1
fi
```

**Issue: "Search returning no results"**
```bash
# Verify search query syntax
# Notion search is case-insensitive but requires exact terms
# Try: "authentication" not "auth" if full word exists
```

**Issue: "Page content truncated"**
```bash
# Large page may need pagination
# This skill auto-handles pagination
# Check temp files: ls -lh /tmp/notion_*
```

## References

- Notion MCP Documentation: https://developers.notion.com/docs/mcp
- Notion API Reference: https://developers.notion.com/reference
- Rate Limits: https://developers.notion.com/reference/request-limits

## Examples

See `examples/` directory:
- `read-large-page.md` - Reading 100KB+ Notion pages
- `search-and-extract.md` - Searching and extracting key info
- `create-from-template.md` - Creating pages from templates
- `sync-workflow.md` - Bidirectional sync with Jira/GitHub
