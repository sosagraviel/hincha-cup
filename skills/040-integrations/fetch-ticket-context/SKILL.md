---
name: fetch-ticket-context
description: Fetch complete context for a Jira ticket including external documentation from Notion, Confluence, and linked resources. Use when starting ticket implementation to gather all requirements.
argument-hint: "JIRA-URL-OR-KEY [--refresh-external]"
---

# Fetch Ticket Context

Comprehensive skill for gathering all context needed to implement a Jira ticket, including:

- Jira ticket details (summary, description, acceptance criteria)
- External documentation (Notion, Confluence, Figma, etc.)
- Linked issues and dependencies
- Sprint/epic context

## Prerequisites

- **Atlassian MCP**: Official remote server with OAuth (for Jira and Confluence)
- **Notion MCP**: Official remote server with OAuth (for Notion)

Setup these servers with:

```bash
claude mcp add atlassian https://mcp.atlassian.com/v1/sse --transport sse
claude mcp add notion https://mcp.notion.com/mcp --transport http
```

## Usage

You can use either the full Jira URL or just the ticket key:

```bash
# Option 1: Full Jira URL (recommended for multiple Atlassian instances)
/fetch-ticket-context https://your-company.atlassian.net/browse/PROJ-123

# Option 2: Just the ticket key
/fetch-ticket-context PROJ-123
```

**URL Parsing:** If a full URL is provided, the skill will automatically extract the ticket key using this pattern:

- Pattern: `https://*.atlassian.net/browse/{TICKET-KEY}`
- Example: `https://acme.atlassian.net/browse/PROJ-123` → extracts `PROJ-123`

## Workflow

### Phase 1: Fetch Jira Ticket

Use the existing `/jira` skill to fetch ticket details:

```bash
# Get full ticket information
ticket_data=$(fetch_jira_issue "$JIRA_KEY")

# Extract key fields
summary=$(echo "$ticket_data" | jq -r '.fields.summary')
description=$(echo "$ticket_data" | jq -r '.fields.description')
acceptance_criteria=$(echo "$ticket_data" | jq -r '.fields.customfield_10XXX // "Not specified"')
priority=$(echo "$ticket_data" | jq -r '.fields.priority.name')
assignee=$(echo "$ticket_data" | jq -r '.fields.assignee.displayName // "Unassigned"')
labels=$(echo "$ticket_data" | jq -r '.fields.labels | join(", ")')
sprint=$(echo "$ticket_data" | jq -r '.fields.customfield_sprint[0].name // "No sprint"')
epic_link=$(echo "$ticket_data" | jq -r '.fields.parent.key // "No epic"')
```

**Output:**

```
✓ Fetched Jira ticket: PROJ-123
  Summary: Implement OAuth2 authentication
  Priority: High
  Sprint: Sprint 15
  Epic: PROJ-100 (Authentication Epic)
```

### Phase 2: Extract External Links

Parse the ticket description and comments for external documentation links:

```bash
# Extract Notion URLs
notion_links=$(echo "$description" | grep -oE 'https://[^/]*\.notion\.so/[^[:space:]]+')

# Extract Confluence URLs
confluence_links=$(echo "$description" | grep -oE 'https://[^/]*\.atlassian\.net/wiki/[^[:space:]]+')

# Extract Figma URLs
figma_links=$(echo "$description" | grep -oE 'https://www\.figma\.com/[^[:space:]]+')

# Extract other URLs
other_links=$(echo "$description" | grep -oE 'https://[^[:space:]]+' | grep -v 'notion\|confluence\|figma\|jira')
```

### Phase 3: Fetch External Documentation

For each discovered link, fetch the content using the appropriate skill:

#### 3a. Fetch Notion Documents

```bash
if [[ -n "$notion_links" ]]; then
    echo "📄 Found Notion documentation:"
    for notion_url in $notion_links; do
        echo "  - $notion_url"

        # Use notion-document-manager skill
        # Handles large docs automatically with chunking
        notion_content=$(fetch_notion_page "$notion_url")

        # Save to context file
        echo "### Notion Document: $notion_url" >> /tmp/context_${JIRA_KEY}.md
        echo "$notion_content" >> /tmp/context_${JIRA_KEY}.md
        echo -e "\n---\n" >> /tmp/context_${JIRA_KEY}.md
    done
    echo "✓ Fetched ${#notion_links[@]} Notion documents"
fi
```

#### 3b. Fetch Confluence Pages

```bash
if [[ -n "$confluence_links" ]]; then
    echo "📚 Found Confluence documentation:"
    for confluence_url in $confluence_links; do
        echo "  - $confluence_url"

        # Extract page ID from URL
        page_id=$(echo "$confluence_url" | grep -oP 'pages/\K[0-9]+')

        # Use mastering-confluence
        confluence_content=$(mcp__atlassian__getConfluencePage --page_id "$page_id")

        # Save to context file
        echo "### Confluence Page: $confluence_url" >> /tmp/context_${JIRA_KEY}.md
        echo "$confluence_content" >> /tmp/context_${JIRA_KEY}.md
        echo -e "\n---\n" >> /tmp/context_${JIRA_KEY}.md
    done
    echo "✓ Fetched ${#confluence_links[@]} Confluence pages"
fi
```

#### 3c. Handle Figma Links

```bash
if [[ -n "$figma_links" ]]; then
    echo "🎨 Found Figma designs:"
    for figma_url in $figma_links; do
        echo "  - $figma_url"

        # Note: Figma content cannot be fetched automatically
        # Provide the link for manual review
        echo "### Figma Design: $figma_url" >> /tmp/context_${JIRA_KEY}.md
        echo "⚠️  Manual review required. Open in browser." >> /tmp/context_${JIRA_KEY}.md
        echo -e "\n---\n" >> /tmp/context_${JIRA_KEY}.md
    done
    echo "⚠️  ${#figma_links[@]} Figma links require manual review"
fi
```

#### 3d. Fetch Other URLs

```bash
if [[ -n "$other_links" ]]; then
    echo "🔗 Found other documentation:"
    for url in $other_links; do
        echo "  - $url"

        # Use WebFetch for general URLs
        content=$(fetch_url_content "$url")

        echo "### External Doc: $url" >> /tmp/context_${JIRA_KEY}.md
        echo "$content" >> /tmp/context_${JIRA_KEY}.md
        echo -e "\n---\n" >> /tmp/context_${JIRA_KEY}.md
    done
    echo "✓ Fetched ${#other_links[@]} external documents"
fi
```

### Phase 4: Fetch Related Tickets

```bash
# Get linked issues
linked_issues=$(mcp__atlassian__jira_get_issue \
    --issue_key "$JIRA_KEY" \
    --expand "issueLinks")

# Extract blocking/blocked issues
blockers=$(echo "$linked_issues" | jq -r '.fields.issuelinks[] | select(.type.name=="Blocks") | .outwardIssue.key')
dependencies=$(echo "$linked_issues" | jq -r '.fields.issuelinks[] | select(.type.name=="Blocks") | .inwardIssue.key')

if [[ -n "$blockers" ]] || [[ -n "$dependencies" ]]; then
    echo "🔗 Related Issues:"
    echo "### Related Jira Tickets" >> /tmp/context_${JIRA_KEY}.md

    if [[ -n "$blockers" ]]; then
        echo "**Blocking:**" >> /tmp/context_${JIRA_KEY}.md
        for blocker in $blockers; do
            blocker_summary=$(mcp__atlassian__jira_get_issue --issue_key "$blocker" | jq -r '.fields.summary')
            echo "- $blocker: $blocker_summary" >> /tmp/context_${JIRA_KEY}.md
        done
    fi

    if [[ -n "$dependencies" ]]; then
        echo "**Depends on:**" >> /tmp/context_${JIRA_KEY}.md
        for dep in $dependencies; then
            dep_summary=$(mcp__atlassian__jira_get_issue --issue_key "$dep" | jq -r '.fields.summary')
            echo "- $dep: $dep_summary" >> /tmp/context_${JIRA_KEY}.md
        done
    fi
fi
```

### Phase 5: Compose Full Context

```bash
# Create comprehensive context document
context_file="/tmp/context_${JIRA_KEY}.md"

cat > "$context_file" <<EOF
# Context for $JIRA_KEY: $summary

## Jira Ticket Details

**Summary:** $summary
**Priority:** $priority
**Assignee:** $assignee
**Sprint:** $sprint
**Epic:** $epic_link
**Labels:** $labels

## Description

$description

## Acceptance Criteria

$acceptance_criteria

---

$(cat /tmp/context_${JIRA_KEY}_external.md 2>/dev/null || echo "No external docs")

EOF

echo "✓ Full context compiled: $context_file"
cat "$context_file"
```

## Output Format

The skill produces a comprehensive context document with this structure:

```markdown
# Context for PROJ-123: Implement OAuth2 authentication

## Jira Ticket Details

**Summary:** Implement OAuth2 authentication
**Priority:** High
**Assignee:** Jane Doe
**Sprint:** Sprint 15
**Epic:** PROJ-100 (Authentication Epic)
**Labels:** backend, security, authentication

## Description

Implement OAuth2 authentication flow following the industry standard...

## Acceptance Criteria

- Users can log in with Google, GitHub, Microsoft
- Refresh tokens work correctly
- Session management is secure
- All security tests pass

---

### Notion Document: Design Specification

[Full Notion content fetched and included here...]

### Confluence Page: API Documentation

[Full Confluence content fetched and included here...]

### Figma Design: Login Flow Mockups

⚠️ Manual review required: https://figma.com/file/...

### Related Jira Tickets

**Blocking:**

- PROJ-120: Set up OAuth providers
- PROJ-121: Configure redirect URIs

**Depends on:**

- PROJ-99: User database schema
```

## Error Handling

### Missing Ticket

```bash
if [[ -z "$ticket_data" ]]; then
    echo "❌ Ticket not found: $JIRA_KEY"
    echo "Verify ticket key and permissions"
    exit 1
fi
```

### Permission Denied on External Docs

```bash
# For Notion
if [[ "$notion_content" == *"403"* ]]; then
    echo "⚠️  Cannot access Notion page (permission denied)"
    echo "Grant bot access: Settings → Connections → Notion MCP"
    # Continue with other docs
fi

# For Confluence
if [[ "$confluence_content" == *"403"* ]]; then
    echo "⚠️  Cannot access Confluence page (permission denied)"
    echo "Check Confluence permissions for bot user"
    # Continue with other docs
fi
```

### Rate Limits

```bash
# Notion: 30 searches/min, 180 req/min total
# Solution: Fetch with delays

fetch_with_rate_limit() {
    local url="$1"
    sleep 0.5  # 2 req/sec = well under limit
    fetch_notion_page "$url"
}
```

### Malformed URLs

```bash
# Validate URLs before fetching
validate_url() {
    local url="$1"
    if [[ ! "$url" =~ ^https?:// ]]; then
        echo "⚠️  Invalid URL: $url (skipping)"
        return 1
    fi
    return 0
}
```

## Best Practices

### 1. Cache Fetched Context

```bash
# Cache context for 1 hour
cache_file="$HOME/.cache/jira_context/${JIRA_KEY}.md"
cache_age=$(find "$cache_file" -mmin -60 2>/dev/null | wc -l)

if [[ $cache_age -gt 0 ]]; then
    echo "Using cached context (< 1 hour old)"
    cat "$cache_file"
    exit 0
fi

# Fetch fresh context
# ... (full workflow)

# Cache result
mkdir -p "$HOME/.cache/jira_context"
cp "/tmp/context_${JIRA_KEY}.md" "$cache_file"
```

### 2. Handle Large Context

```bash
# Estimate token count
context_size=$(wc -c < "$context_file")
tokens_est=$((context_size / 4))

if [[ $tokens_est -gt 20000 ]]; then
    echo "⚠️  Large context: ~$tokens_est tokens"
    echo "Consider summarizing before proceeding"
fi
```

### 3. Parallel Fetching (if multiple docs)

```bash
# For multiple Notion pages, fetch in parallel
for notion_url in $notion_links; do
    (
        content=$(fetch_notion_page "$notion_url")
        echo "$content" > "/tmp/notion_$(basename "$notion_url").md"
    ) &
done
wait  # Wait for all parallel fetches

# Combine results
cat /tmp/notion_*.md >> /tmp/context_${JIRA_KEY}.md
```

### 4. Provide Summary

```bash
# After fetching all context, provide a brief summary
echo "
## Context Summary

- Jira ticket: $summary
- External docs: ${doc_count} documents fetched
- Related tickets: ${related_count} dependencies
- Total context size: ~${tokens_est} tokens
- Ready for implementation: ✓
"
```

## Integration with Workflow

This skill is the **first step** of `/implement-ticket` Phase 1 when the
ticket source is Jira (`--from-jira <TICKET-ID>`). It produces the
canonical `context/ticket-context.md` artifact that every later phase
reads — Phase 3's planner agent absorbs it, Phase 5's implementer reads
the planner's plan (which already cites this artifact), and so on.

This skill **only gathers context**: ticket body, comments, linked URLs
(Confluence / Notion / Figma frames when reachable), and attachments. It
does not plan, perform requirements analysis, propose implementation
steps, or recommend code changes. Planning is the planner agent's job
(Phase 3 of `/implement-ticket`); implementation is the
`implementer-{lang}` agent's job (Phase 5).

## Troubleshooting

**Issue: "No external links found"**

- Check if ticket description contains URLs
- Look in comments: `mcp__atlassian__jira_get_issue --expand "comments"`

**Issue: "Context too large"**

- Summarize Notion/Confluence content before including
- Focus on key sections only (e.g., "Requirements", "Design")

**Issue: "Cannot fetch Notion page"**

- Verify Notion MCP is configured: `mcp__notion__fetch_page --help`
- Check bot has access to page in Notion settings

## Examples

### Example 1: Simple Ticket (No External Docs)

```bash
$ /fetch-ticket-context PROJ-100

✓ Fetched Jira ticket: PROJ-100
  Summary: Fix null pointer in auth handler
  Priority: Medium
  No external documentation links found

Context ready (~500 tokens)
```

### Example 2: Complex Ticket (Multiple External Docs)

```bash
$ /fetch-ticket-context PROJ-123

✓ Fetched Jira ticket: PROJ-123
  Summary: Implement OAuth2 authentication

📄 Found Notion documentation:
  - https://notion.so/OAuth-Design-Spec-abc123
✓ Fetched 1 Notion document (25KB, chunked)

📚 Found Confluence documentation:
  - https://company.atlassian.net/wiki/pages/456789
✓ Fetched 1 Confluence page

🎨 Found Figma designs:
  - https://figma.com/file/oauth-flow
⚠️  1 Figma link requires manual review

🔗 Related Issues:
  - PROJ-120 (Blocking): Set up OAuth providers
  - PROJ-99 (Dependency): User database schema

Context ready (~15,000 tokens)
```

## Caching to docs/llm-wiki/raw/external/

When `framework-config.json` has `wiki.cache_external: true` (default `false`) AND the project
has been initialized (`docs/llm-wiki/` exists), the skill MUST persist every fetched external doc to:

```
docs/llm-wiki/raw/external/<source-type>/<source-id>.md
```

with frontmatter carrying `source_url`, `source_type`, `source_id`, `ticket_id`, `fetched_at`, and
`sha256`. Use the `external-cache` helper exposed at:

```
orchestration/src/services/graph-wiki/external-cache.ts
```

Specifically:

```ts
import { writeExternalCache } from '<orchestration>/services/graph-wiki/external-cache.js';

writeExternalCache({
  projectPath,
  sourceType: 'jira',          // or 'notion' | 'confluence' | 'github' | 'other'
  sourceId: 'PROJ-123',
  sourceUrl: 'https://...',
  ticketId: 'PROJ-123',
  title: 'Add user search',
  body: fetchedMarkdown,
});
```

Before fetching, ALWAYS check the cache first (unless `--refresh-external` was passed):

```ts
import { readExternalCache } from '<orchestration>/services/graph-wiki/external-cache.js';

const hit = readExternalCache({ projectPath, sourceType: 'jira', sourceId: 'PROJ-123' });
if (hit) {
  // Use hit.body; skip the network call.
}
```

### Flags

| Flag | Description |
|------|-------------|
| `--refresh-external` | Bypass the cache for this run; always re-fetch external docs and overwrite cached entries. |

### Cache rules

- When `wiki.cache_external` is `false` (the default), the skill MUST NOT write to the cache and
  falls back to the legacy "fetch-and-discard" path. This keeps the default behavior identical to
  pre-cache behavior — no surprise file writes.
- The cache is invalidated automatically after 7 days (`maxAgeMs` default in `readExternalCache`).
- Pass `--refresh-external` to bypass the cache for a single run.
- Supported `source_type` values: `jira`, `notion`, `confluence`, `github`, `other`.
- `sourceId` is sanitized for filesystem safety: characters outside `[a-zA-Z0-9._-]` are replaced
  with `_`. For example, `PROJ-123` stays `PROJ-123.md` and `notion uuid/abc` becomes
  `notion_uuid_abc.md`.

## References

- Jira Skill: `{{CONFIG_DIR}}/skills/jira/SKILL.md`
- Notion Manager: `{{CONFIG_DIR}}/skills/notion-document-manager/SKILL.md`
- Confluence Skill: `{{CONFIG_DIR}}/skills/mastering-confluence/SKILL.md`
- External cache helper: `orchestration/src/services/graph-wiki/external-cache.ts`
