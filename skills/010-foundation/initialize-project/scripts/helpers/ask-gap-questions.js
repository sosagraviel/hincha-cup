#!/usr/bin/env node

/**
 * Interactive Gap Questioner
 * Reads gaps from consolidation.json and asks user questions interactively
 *
 * IMPORTANT: When this script runs, process.stdin may NOT be the terminal
 * because parent bash scripts use heredocs to feed input to claude.
 * We must explicitly open /dev/tty to get actual user input.
 */

const fs = require('fs');
const readline = require('readline');

// Get consolidation file path from command line
const consolidationFile = process.argv[2];

if (!consolidationFile) {
  console.error('Error: Consolidation file path required');
  process.exit(1);
}

if (!fs.existsSync(consolidationFile)) {
  console.error(`Error: Consolidation file not found: ${consolidationFile}`);
  process.exit(1);
}

/**
 * Get input stream - use /dev/tty when stdin is not a TTY
 * This is required when running from scripts that pipe input to other processes
 */
function getInputStream() {
  // Check if stdin is a TTY (interactive terminal)
  if (process.stdin.isTTY) {
    return process.stdin;
  }

  // stdin is NOT a TTY (e.g., piped from parent script)
  // Open /dev/tty directly to get user input
  try {
    const ttyStream = fs.createReadStream('/dev/tty', { encoding: 'utf8' });
    return ttyStream;
  } catch (error) {
    console.error('Error: Cannot open /dev/tty for interactive input.');
    console.error('This script requires an interactive terminal.');
    console.error('Use --skip-gap-questions to run in non-interactive mode.');
    process.exit(1);
  }
}

// Get the appropriate input stream
const inputStream = getInputStream();

// Create readline interface with proper input source
const rl = readline.createInterface({
  input: inputStream,
  output: process.stdout,
  terminal: true  // Treat output as terminal for proper prompting
});

// Handle CTRL+C gracefully
process.on('SIGINT', () => {
  console.log('\n\nInterrupted. Exiting...');
  rl.close();
  if (inputStream !== process.stdin) {
    inputStream.destroy();
  }
  process.exit(130);
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

async function askQuestions() {
  try {
    const data = JSON.parse(fs.readFileSync(consolidationFile, 'utf-8'));

    if (!data.gaps || data.gaps.length === 0) {
      console.log('✓ No gaps found - analysis is complete!');
      console.log('');
      rl.close();
      return;
    }

    const clarifications = {};
    let answeredCount = 0;

    for (let i = 0; i < data.gaps.length; i++) {
      const gap = data.gaps[i];

      // Normalize gap fields to handle different gap types
      const item = gap.item || gap.language || `Gap from ${gap.agent || 'unknown agent'}`;
      const reason = gap.reason || 'No additional context provided';
      const agent = gap.agent || 'unknown';
      const priority = gap.priority || gap.severity || 'medium';

      // Use the question from agent output - it should always be present
      // The agent prompts explicitly instruct agents to provide proper questions
      // in the format: "What are the required X? (e.g., 'example values')"
      let questionText = gap.question;

      // Fallback only for gaps from merge-analyses.js internal checks (sparse_findings, etc.)
      // These won't have agent-provided questions
      if (!questionText) {
        // For internal gap types, create a minimal fallback
        if (gap.type === 'sparse_findings') {
          questionText = `The ${item} analysis was incomplete. Can you provide more details about this area?`;
        } else if (gap.type === 'missing_language_coverage') {
          questionText = `The analysis missed coverage for ${item}. What additional context can you provide?`;
        } else {
          // Last resort fallback - but this indicates a bug in agent prompts
          // Agents SHOULD always provide a question field
          console.warn(`  Warning: Gap "${item}" from ${agent} is missing a question field.`);
          questionText = `Please provide information about: ${item}`;
        }
      }

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`Question ${i + 1} of ${data.gaps.length}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`\n${questionText}\n`);
      console.log(`Context: ${reason}`);
      console.log(`Priority: ${priority} | From: ${agent}`);
      console.log('');

      const answer = await question('Answer: ');

      // Save answer if not skipped or empty
      if (answer.toLowerCase() !== 'skip' && answer.trim() !== '') {
        clarifications[item] = {
          gap_type: gap.type,
          agent: agent,
          priority: priority,
          user_answer: answer.trim(),
          timestamp: new Date().toISOString()
        };
        answeredCount++;
        console.log('✓ Answer recorded\n');
      } else {
        console.log('⊘ Skipped\n');
      }
    }

    // Add clarifications to the consolidation file
    data.user_clarifications = clarifications;

    // Write back
    fs.writeFileSync(consolidationFile, JSON.stringify(data, null, 2), 'utf-8');

    console.log('');
    console.log('✓ Clarifications saved to consolidation.json');
    console.log(`  Answered: ${answeredCount} / ${data.gaps.length}`);
    console.log('');

    rl.close();
    if (inputStream !== process.stdin) {
      inputStream.destroy();
    }
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    console.error(error.stack);
    rl.close();
    if (inputStream !== process.stdin) {
      inputStream.destroy();
    }
    process.exit(1);
  }
}

askQuestions();
