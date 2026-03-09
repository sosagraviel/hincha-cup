#!/bin/bash
# Generate INDEX.md files for skills and agents

PROJECT_ROOT="$1"
SKILL_SELECTION_JSON="$2"
AGENT_GENERATION_JSON="$3"
PROJECT_NAME=$(basename "$PROJECT_ROOT")

# Generate skills INDEX.md
cat > "$PROJECT_ROOT/.claude/skills/INDEX.md" << EOF
# Skills Inventory

**Project**: $PROJECT_NAME
**Last Updated**: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

---

## Foundation

$(cat "$SKILL_SELECTION_JSON" | node -e "const s=JSON.parse(require('fs').readFileSync(0));s.always_copied.filter(x=>x.category==='010-foundation').forEach(x=>console.log(\`- \\\`/\${x.name}\\\` - \${x.reason}\`));")

## Development Workflow

$(cat "$SKILL_SELECTION_JSON" | node -e "const s=JSON.parse(require('fs').readFileSync(0));s.always_copied.filter(x=>x.category==='020-development-workflow').forEach(x=>console.log(\`- \\\`/\${x.name}\\\` - \${x.reason}\`));")

## Quality Assurance

$(cat "$SKILL_SELECTION_JSON" | node -e "const s=JSON.parse(require('fs').readFileSync(0));const qa=[...s.always_copied.filter(x=>x.category==='030-quality-assurance'),...s.language_specific.filter(x=>x.category==='030-quality-assurance')];qa.forEach(x=>console.log(\`- \\\`/\${x.name}\\\` - \${x.reason}\`));")

## Integrations

$(cat "$SKILL_SELECTION_JSON" | node -e "const s=JSON.parse(require('fs').readFileSync(0));const int=[...s.always_copied.filter(x=>x.category==='040-integrations'),...s.integrations];int.forEach(x=>console.log(\`- \\\`/\${x.name}\\\` - \${x.reason}\`));")

## Language & Frameworks

$(cat "$SKILL_SELECTION_JSON" | node -e "const s=JSON.parse(require('fs').readFileSync(0));const lf=[...s.language_specific.filter(x=>x.category==='050-language-frameworks'),...s.frontend,...s.backend];lf.forEach(x=>console.log(\`- \\\`/\${x.name}\\\` - \${x.reason}\`));")

## Infrastructure

$(cat "$SKILL_SELECTION_JSON" | node -e "const s=JSON.parse(require('fs').readFileSync(0));s.infrastructure.forEach(x=>console.log(\`- \\\`/\${x.name}\\\` - \${x.reason}\`));")

## Cloud Platforms

$(cat "$SKILL_SELECTION_JSON" | node -e "const s=JSON.parse(require('fs').readFileSync(0));s.cloud.forEach(x=>console.log(\`- \\\`/\${x.name}\\\` - \${x.reason}\`));")

---

**Total Skills**: $(cat "$SKILL_SELECTION_JSON" | node -e "const s=JSON.parse(require('fs').readFileSync(0));console.log(s.total);")

To use a skill, type: \`/skill-name\` in Claude Code
To list all skills: \`ls .claude/skills/\`
EOF

# Generate agents INDEX.md
cat > "$PROJECT_ROOT/.claude/agents/INDEX.md" << EOF
# Agents Inventory

**Project**: $PROJECT_NAME
**Last Updated**: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

---

## Planning Agents

$(cat "$AGENT_GENERATION_JSON" | node -e "const g=JSON.parse(require('fs').readFileSync(0));g.planning.forEach(a=>console.log(\`- \\\`\${a.name}\\\` (model: \${a.model}) - \${a.description}\`));")

## Implementation Agents

$(cat "$AGENT_GENERATION_JSON" | node -e "const g=JSON.parse(require('fs').readFileSync(0));g.implementation.forEach(a=>console.log(\`- \\\`\${a.name}\\\` (model: \${a.model}) - \${a.description}\`));")

## Testing Agents

$(cat "$AGENT_GENERATION_JSON" | node -e "const g=JSON.parse(require('fs').readFileSync(0));g.testing.forEach(a=>console.log(\`- \\\`\${a.name}\\\` (model: \${a.model}) - \${a.description}\`));")

## Review Agents

$(cat "$AGENT_GENERATION_JSON" | node -e "const g=JSON.parse(require('fs').readFileSync(0));g.review.forEach(a=>console.log(\`- \\\`\${a.name}\\\` (model: \${a.model}) - \${a.description}\`));")

---

**Total Agents**: $(cat "$AGENT_GENERATION_JSON" | node -e "const g=JSON.parse(require('fs').readFileSync(0));console.log(g.total);")

To run an agent: \`claude-code agents run <agent-name>\`
To list agents: \`ls .claude/agents/\`
EOF
