#!/usr/bin/env node

/**
 * Interactive Gap Questioner
 * Reads gaps from consolidation.json and asks user questions interactively
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

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true
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
      console.log('No gaps found.');
      rl.close();
      return;
    }

    const clarifications = {};

    for (let i = 0; i < data.gaps.length; i++) {
      const gap = data.gaps[i];

      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`Question ${i + 1} of ${data.gaps.length}`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`Topic: ${gap.item}`);
      console.log(`Reason: ${gap.reason}`);
      console.log(`Priority: ${gap.priority}`);
      console.log('');

      const answer = await question('Your answer (or "skip" to skip, "unknown" if unsure): ');

      // Save answer if not skipped or empty
      if (answer.toLowerCase() !== 'skip' && answer.trim() !== '') {
        clarifications[gap.item] = {
          gap_type: gap.type,
          agent: gap.agent,
          priority: gap.priority,
          user_answer: answer.trim(),
          timestamp: new Date().toISOString()
        };
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
    console.log(`  Answered: ${Object.keys(clarifications).length} / ${data.gaps.length}`);
    console.log('');

    rl.close();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    rl.close();
    process.exit(1);
  }
}

askQuestions();
