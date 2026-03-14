#!/usr/bin/env node
/**
 * CLI wrapper for stack detection
 * Usage: node utils/stack/cli.js [project-path]
 */

const { detectStack } = require('./index');

async function main() {
  const projectPath = process.argv[2] || process.cwd();

  console.error(`Detecting stack for: ${projectPath}\n`);

  try {
    const result = await detectStack(projectPath);

    if (!result.success) {
      console.error('Error:', result.error);
      process.exit(1);
    }

    console.log(JSON.stringify(result.profile, null, 2));
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
