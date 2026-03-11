#!/bin/bash
# Interactive Gap Questioner
# Reads gaps from consolidation.json and asks user questions

CONSOLIDATION_FILE="$1"

if [ ! -f "$CONSOLIDATION_FILE" ]; then
  echo "Error: Consolidation file not found: $CONSOLIDATION_FILE"
  exit 1
fi

# Colors
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m'

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  GAP CLARIFICATION QUESTIONS${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Some gaps were detected in the codebase analysis."
echo "Please answer these questions to help improve the project context."
echo ""
echo "You can:"
echo "  - Answer the question"
echo "  - Type 'skip' to skip"
echo "  - Type 'unknown' if you don't know"
echo ""

# Extract gaps and ask questions
node -e "
const fs = require('fs');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function askQuestions() {
  try {
    const data = JSON.parse(fs.readFileSync('$CONSOLIDATION_FILE', 'utf-8'));

    if (!data.gaps || data.gaps.length === 0) {
      console.log('No gaps found.');
      rl.close();
      return;
    }

    const clarifications = {};

    for (let i = 0; i < data.gaps.length; i++) {
      const gap = data.gaps[i];
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(\`Question \${i + 1} of \${data.gaps.length}\`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(\`Topic: \${gap.item}\`);
      console.log(\`Reason: \${gap.reason}\`);
      console.log(\`Priority: \${gap.priority}\`);
      console.log('');

      const answer = await question('Your answer (or "skip" to skip, "unknown" if unsure): ');

      if (answer.toLowerCase() !== 'skip' && answer.toLowerCase() !== '') {
        clarifications[gap.item] = {
          gap_type: gap.type,
          agent: gap.agent,
          priority: gap.priority,
          user_answer: answer.trim(),
          timestamp: new Date().toISOString()
        };
      }
    }

    // Add clarifications to the consolidation file
    data.user_clarifications = clarifications;

    // Write back
    fs.writeFileSync('$CONSOLIDATION_FILE', JSON.stringify(data, null, 2), 'utf-8');

    console.log('');
    console.log('✓ Clarifications saved to consolidation.json');
    console.log(\`  Answered: \${Object.keys(clarifications).length} / \${data.gaps.length}\`);
    console.log('');

    rl.close();
  } catch (error) {
    console.error('Error:', error.message);
    rl.close();
    process.exit(1);
  }
}

askQuestions();
"

exit $?
