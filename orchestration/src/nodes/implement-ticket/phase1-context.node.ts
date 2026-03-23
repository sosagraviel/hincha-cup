import { existsSync, readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { ImplementTicketState } from '../../state/schemas/implement-ticket.schema.js';

/**
 * Format Atlassian Document Format (ADF) to markdown
 * Jira uses ADF for rich text fields like description
 */
function formatAtlassianDocument(adf: any): string {
  if (!adf || !adf.content) return '';

  const formatNode = (node: any): string => {
    if (!node) return '';

    switch (node.type) {
      case 'paragraph':
        return (node.content || []).map(formatNode).join('') + '\n\n';

      case 'text':
        let text = node.text || '';
        if (node.marks) {
          for (const mark of node.marks) {
            switch (mark.type) {
              case 'strong':
                text = `**${text}**`;
                break;
              case 'em':
                text = `*${text}*`;
                break;
              case 'code':
                text = `\`${text}\``;
                break;
              case 'link':
                text = `[${text}](${mark.attrs?.href || ''})`;
                break;
            }
          }
        }
        return text;

      case 'heading':
        const level = node.attrs?.level || 1;
        const headingText = (node.content || []).map(formatNode).join('');
        return '#'.repeat(level) + ' ' + headingText + '\n\n';

      case 'bulletList':
        return (node.content || []).map((item: any) => {
          const itemText = formatNode(item).trim();
          return `- ${itemText}`;
        }).join('\n') + '\n\n';

      case 'orderedList':
        return (node.content || []).map((item: any, index: number) => {
          const itemText = formatNode(item).trim();
          return `${index + 1}. ${itemText}`;
        }).join('\n') + '\n\n';

      case 'listItem':
        return (node.content || []).map(formatNode).join('').trim();

      case 'codeBlock':
        const language = node.attrs?.language || '';
        const code = (node.content || []).map(formatNode).join('');
        return `\`\`\`${language}\n${code}\n\`\`\`\n\n`;

      case 'blockquote':
        const quoteText = (node.content || []).map(formatNode).join('');
        return quoteText.split('\n').map((line: string) => `> ${line}`).join('\n') + '\n\n';

      case 'hardBreak':
        return '\n';

      default:
        // For unknown node types, try to process content if it exists
        if (node.content) {
          return (node.content || []).map(formatNode).join('');
        }
        return '';
    }
  };

  return (adf.content || []).map(formatNode).join('').trim();
}

/**
 * Phase 1: Context Gathering Node
 *
 * This node gathers implementation context based on input source:
 * - --from-markdown: Reads markdown file
 * - --from-input: Accepts direct context input
 * - --from-jira: TODO - Spawns context-gatherer agent to fetch Jira + Confluence
 *
 * Key Design Principles:
 * - Idempotent: Can be re-run safely by checking completion marker file
 * - Disk-first: ALL outputs written to disk BEFORE returning state
 * - Read from disk: Reads Phase 0 outputs from disk, NOT from state
 *
 * @param state - Current workflow state
 * @returns Updated state with phase1 completion flag
 */
export async function phase1ContextNode(
  state: ImplementTicketState
): Promise<Partial<ImplementTicketState>> {
  const ticketId = state.ticket_id;
  const projectPath = state.project_path;
  const tempDir = state.temp_dir || join(projectPath, '.claude-temp/implement-ticket', ticketId);
  const phase1Dir = join(tempDir, 'phase1');

  console.log('\n[Phase 1: Context] Starting context gathering...');

  // 1. Check if already complete (idempotency)
  const completionMarkerPath = join(phase1Dir, 'context-complete.json');
  if (existsSync(completionMarkerPath)) {
    console.log('[Phase 1: Context] Already complete, skipping');
    const completionData = JSON.parse(readFileSync(completionMarkerPath, 'utf-8'));
    return {
      current_phase: 'phase2_planning',
      phase1_complete: true,
      phase1_context: completionData.context_data
    };
  }

  try {
    // 2. Validate Phase 0 completed (read from disk, NOT state)
    console.log('[Phase 1: Context] Validating Phase 0 completion...');
    const phase0Dir = join(tempDir, 'phase0');
    const phase0CompletionPath = join(phase0Dir, 'preflight-complete.json');

    if (!existsSync(phase0CompletionPath)) {
      throw new Error(
        'Phase 0 not complete. Run Phase 0 first or use --start-phase 0'
      );
    }
    console.log('[Phase 1: Context] ✓ Phase 0 verified');

    // 3. Gather context based on input source
    const inputSource = state.input_source;
    const inputValue = state.input_value;
    let fullContext = '';
    let externalDocs = '';

    console.log(`[Phase 1: Context] Gathering context from ${inputSource}...`);

    switch (inputSource) {
      case 'markdown': {
        // Read markdown file
        if (!existsSync(inputValue)) {
          throw new Error(`Markdown file not found: ${inputValue}`);
        }

        fullContext = readFileSync(inputValue, 'utf-8');
        console.log(`[Phase 1: Context] ✓ Read markdown file (${fullContext.split('\n').length} lines)`);

        // TODO: Optionally fetch external links mentioned in markdown
        // For now, just note that external docs are empty
        externalDocs = '';
        break;
      }

      case 'input': {
        // Direct input
        fullContext = inputValue;
        console.log(`[Phase 1: Context] ✓ Used direct input (${fullContext.split('\n').length} lines)`);
        externalDocs = '';
        break;
      }

      case 'jira': {
        // Parse Jira URL to extract domain and ticket key
        // Expected format: https://{domain}.atlassian.net/browse/{TICKET_KEY}
        const jiraUrlMatch = inputValue.match(/https?:\/\/([^.]+)\.atlassian\.net\/browse\/([A-Z]+-\d+)/i);

        if (!jiraUrlMatch) {
          throw new Error(
            `Invalid Jira URL format: ${inputValue}\n` +
            `Expected format: https://{domain}.atlassian.net/browse/{TICKET-123}`
          );
        }

        const [, domain, ticketKey] = jiraUrlMatch;
        const jiraBaseUrl = `https://${domain}.atlassian.net`;

        // Validate authentication credentials
        const jiraEmail = process.env.JIRA_EMAIL;
        const jiraApiToken = process.env.JIRA_API_TOKEN;

        if (!jiraEmail || !jiraApiToken) {
          throw new Error(
            'Jira authentication not configured.\n' +
            'Please set the following environment variables:\n' +
            '  JIRA_EMAIL - Your Atlassian account email\n' +
            '  JIRA_API_TOKEN - Your Jira API token\n\n' +
            'Generate a token at: https://id.atlassian.com/manage-profile/security/api-tokens\n\n' +
            'Alternative: Use --from-markdown with a manually exported Jira ticket'
          );
        }

        console.log(`[Phase 1: Context] Fetching Jira ticket: ${ticketKey} from ${jiraBaseUrl}`);

        try {
          // Fetch issue from Jira REST API v3
          const authHeader = `Basic ${Buffer.from(`${jiraEmail}:${jiraApiToken}`).toString('base64')}`;

          const response = await fetch(
            `${jiraBaseUrl}/rest/api/3/issue/${ticketKey}`,
            {
              headers: {
                'Authorization': authHeader,
                'Accept': 'application/json'
              }
            }
          );

          if (!response.ok) {
            if (response.status === 401) {
              throw new Error(
                'Jira authentication failed (401 Unauthorized).\n' +
                'Please verify your JIRA_EMAIL and JIRA_API_TOKEN are correct.\n' +
                'Generate a new token at: https://id.atlassian.com/manage-profile/security/api-tokens'
              );
            } else if (response.status === 404) {
              throw new Error(
                `Jira ticket not found: ${ticketKey}\n` +
                `Please verify the ticket exists and you have access to it.`
              );
            } else {
              const errorText = await response.text();
              throw new Error(
                `Jira API error (${response.status}): ${errorText}`
              );
            }
          }

          const issue = await response.json();

          // Extract key fields
          const summary = issue.fields.summary || '';
          const description = issue.fields.description || {};
          const issueType = issue.fields.issuetype?.name || 'Unknown';
          const status = issue.fields.status?.name || 'Unknown';
          const priority = issue.fields.priority?.name || 'None';
          const assignee = issue.fields.assignee?.displayName || 'Unassigned';
          const reporter = issue.fields.reporter?.displayName || 'Unknown';
          const created = issue.fields.created || '';
          const updated = issue.fields.updated || '';

          // Format description from ADF to markdown
          const descriptionMarkdown = formatAtlassianDocument(description);

          // Build full context markdown
          const contextLines: string[] = [];
          contextLines.push(`# ${ticketKey}: ${summary}`);
          contextLines.push('');
          contextLines.push(`**URL**: ${inputValue}`);
          contextLines.push(`**Type**: ${issueType}`);
          contextLines.push(`**Status**: ${status}`);
          contextLines.push(`**Priority**: ${priority}`);
          contextLines.push(`**Assignee**: ${assignee}`);
          contextLines.push(`**Reporter**: ${reporter}`);
          contextLines.push(`**Created**: ${created}`);
          contextLines.push(`**Updated**: ${updated}`);
          contextLines.push('');
          contextLines.push('## Description');
          contextLines.push('');
          contextLines.push(descriptionMarkdown || '_No description provided_');
          contextLines.push('');

          // Extract acceptance criteria if present
          const acceptanceCriteria = issue.fields.customfield_10000; // Common AC field
          if (acceptanceCriteria) {
            contextLines.push('## Acceptance Criteria');
            contextLines.push('');
            if (typeof acceptanceCriteria === 'string') {
              contextLines.push(acceptanceCriteria);
            } else {
              contextLines.push(formatAtlassianDocument(acceptanceCriteria));
            }
            contextLines.push('');
          }

          // Extract comments if any
          if (issue.fields.comment?.comments?.length > 0) {
            contextLines.push('## Comments');
            contextLines.push('');
            for (const comment of issue.fields.comment.comments) {
              const author = comment.author?.displayName || 'Unknown';
              const created = comment.created || '';
              const body = formatAtlassianDocument(comment.body);
              contextLines.push(`### ${author} (${created})`);
              contextLines.push('');
              contextLines.push(body);
              contextLines.push('');
            }
          }

          fullContext = contextLines.join('\n');

          console.log(`[Phase 1: Context] ✓ Fetched Jira ticket (${fullContext.split('\n').length} lines)`);

          // Detect Confluence links in description
          const confluenceLinks = descriptionMarkdown.match(/https?:\/\/[^.]+\.atlassian\.net\/wiki\/spaces\/[^\s)]+/g);

          if (confluenceLinks && confluenceLinks.length > 0) {
            console.log(`[Phase 1: Context] Detected ${confluenceLinks.length} Confluence link(s)`);
            console.log('[Phase 1: Context] Note: Confluence content not automatically fetched');
            console.log('[Phase 1: Context] Links included in context for manual review');

            externalDocs = `# External Documentation Links\n\n`;
            externalDocs += `The following Confluence pages are referenced in the ticket:\n\n`;
            confluenceLinks.forEach((link, index) => {
              externalDocs += `${index + 1}. ${link}\n`;
            });
            externalDocs += `\n**Note**: These links are included for reference. Consider reviewing them manually if they contain critical implementation details.`;
          } else {
            externalDocs = '';
          }

        } catch (error: any) {
          // Check if it's a network error
          if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
            throw new Error(
              `Cannot connect to Jira at ${jiraBaseUrl}\n` +
              `Please check your internet connection and verify the domain is correct.\n` +
              `Original error: ${error.message}`
            );
          }

          // Re-throw other errors (already formatted with helpful messages)
          throw error;
        }

        break;
      }

      default:
        throw new Error(`Unknown input source: ${inputSource}`);
    }

    // 4. Validate context completeness
    if (!fullContext || fullContext.trim().length === 0) {
      throw new Error('Context is empty. Please provide valid context.');
    }

    // Check minimum context length (at least 50 characters)
    if (fullContext.trim().length < 50) {
      throw new Error(
        `Context too short (${fullContext.length} characters). ` +
        'Please provide more detailed implementation requirements.'
      );
    }

    console.log(`[Phase 1: Context] ✓ Context validated (${fullContext.length} characters)`);

    // 5. PERSIST TO DISK FIRST (critical for idempotency!)
    console.log('[Phase 1: Context] Writing outputs to disk...');
    mkdirSync(phase1Dir, { recursive: true });

    // Save full context
    writeFileSync(join(phase1Dir, 'full-context.md'), fullContext);

    // Save external docs (if any)
    if (externalDocs) {
      writeFileSync(join(phase1Dir, 'external-docs.md'), externalDocs);
    }

    // Save context data
    const contextData = {
      full_context: fullContext,
      external_docs: externalDocs || undefined,
      source: inputSource,
      timestamp: new Date().toISOString()
    };

    writeFileSync(
      join(phase1Dir, 'context-data.json'),
      JSON.stringify(contextData, null, 2)
    );

    // Write completion marker (last file to write - indicates phase complete)
    writeFileSync(
      completionMarkerPath,
      JSON.stringify({
        completed_at: new Date().toISOString(),
        ticket_id: ticketId,
        context_data: contextData
      }, null, 2)
    );

    console.log('[Phase 1: Context] ✓ Outputs written to disk');
    console.log(`[Phase 1: Context] ✓ Phase complete (outputs: ${phase1Dir})`);

    // 6. Return MINIMAL state (just flow control, NO data!)
    return {
      current_phase: 'phase2_planning',
      phase1_complete: true,
      phase1_context: contextData
    };

  } catch (error) {
    const errorMessage = `Context gathering failed: ${(error as Error).message}`;
    console.error(`[Phase 1: Context] ✗ ${errorMessage}`);

    return {
      errors: [errorMessage],
      current_phase: 'failed'
    };
  }
}
