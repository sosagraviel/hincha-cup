const fs = require('fs').promises;
const path = require('path');

const DEFAULT_COMMANDS = {
  typescript: {
    lint: 'npx eslint . --ext .ts,.tsx',
    format: 'npx prettier --write .',
    typecheck: 'npx tsc --noEmit',
    test: 'npm test',
    build: 'npm run build',
    test_framework: 'vitest',
    e2e: 'npx playwright test',
    coverage: 'npm test -- --coverage',
    coverage_view: 'open coverage/index.html',
    audit: 'npm audit'
  },
  javascript: {
    lint: 'npx eslint . --ext .js,.jsx',
    format: 'npx prettier --write .',
    typecheck: 'Not applicable (JavaScript is not statically typed)',
    test: 'npm test',
    build: 'Not applicable (JavaScript runs without compilation)',
    test_framework: 'vitest',
    e2e: 'npx playwright test',
    coverage: 'npm test -- --coverage',
    coverage_view: 'open coverage/index.html',
    audit: 'npm audit'
  },
  python: {
    lint: 'ruff check .',
    format: 'ruff format .',
    typecheck: 'mypy .',
    test: 'pytest tests/',
    build: 'Not applicable (Python is interpreted)',
    test_framework: 'pytest',
    e2e: 'pytest tests/e2e/',
    coverage: 'pytest --cov=src --cov-report=html',
    coverage_view: 'open htmlcov/index.html',
    audit: 'safety check'
  },
  go: {
    lint: 'golangci-lint run',
    format: 'go fmt ./...',
    typecheck: 'go vet ./...',
    test: 'go test ./...',
    build: 'go build ./...',
    test_framework: 'testing',
    e2e: 'go test ./e2e/...',
    coverage: 'go test -cover ./...',
    coverage_view: 'go tool cover -html=coverage.out',
    audit: 'go list -m all | nancy sleuth'
  },
  rust: {
    lint: 'cargo clippy',
    format: 'cargo fmt',
    typecheck: 'cargo check',
    test: 'cargo test',
    build: 'cargo build',
    test_framework: 'cargo test',
    e2e: 'cargo test --test e2e',
    coverage: 'cargo tarpaulin',
    coverage_view: 'open tarpaulin-report.html',
    audit: 'cargo audit'
  }
};

function getDefault(lang, cmd) {
  return DEFAULT_COMMANDS[lang]?.[cmd] || `echo "No ${cmd} command configured"`;
}

function findScript(scripts, candidates) {
  for (const candidate of candidates) {
    if (scripts[candidate]) {
      return candidate;
    }
  }
  return null;
}

async function readPackageJson(projectPath) {
  try {
    const content = await fs.readFile(path.join(projectPath, 'package.json'), 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function extractCommandsForLanguage(projectPath, stackProfile, language) {
  const commands = {
    lint_command: null,
    format_command: null,
    type_check_command: null,
    unit_test_command: null,
    integration_test_command: null,
    e2e_test_command: null,
    coverage_command: null,
    build_command: null,
    test_framework: null,
    e2e_framework: null
  };

  if (language === 'typescript' || language === 'javascript') {
    const packageJson = await readPackageJson(projectPath);

    if (packageJson?.scripts) {
      const scripts = packageJson.scripts;
      const packageManager = stackProfile.package_manager || 'npm';

      commands.lint_command = findScript(scripts, ['lint:check', 'lint'])
        ? `${packageManager} run ${findScript(scripts, ['lint:check', 'lint'])}`
        : getDefault(language, 'lint');

      commands.format_command = findScript(scripts, ['format', 'prettier'])
        ? `${packageManager} run ${findScript(scripts, ['format', 'prettier'])}`
        : getDefault(language, 'format');

      commands.type_check_command = findScript(scripts, ['type:check', 'typecheck', 'tsc'])
        ? `${packageManager} run ${findScript(scripts, ['type:check', 'typecheck', 'tsc'])}`
        : getDefault(language, 'typecheck');

      commands.unit_test_command = findScript(scripts, ['test:unit', 'test'])
        ? `${packageManager} run ${findScript(scripts, ['test:unit', 'test'])}`
        : getDefault(language, 'test');

      commands.integration_test_command = findScript(scripts, ['test:integration', 'test:int'])
        ? `${packageManager} run ${findScript(scripts, ['test:integration', 'test:int'])}`
        : null;

      commands.e2e_test_command = findScript(scripts, ['test:e2e', 'test:playwright', 'test:cypress'])
        ? `${packageManager} run ${findScript(scripts, ['test:e2e', 'test:playwright', 'test:cypress'])}`
        : getDefault(language, 'e2e');

      commands.coverage_command = findScript(scripts, ['test:coverage', 'coverage'])
        ? `${packageManager} run ${findScript(scripts, ['test:coverage', 'coverage'])}`
        : getDefault(language, 'coverage');

      commands.build_command = findScript(scripts, ['build', 'compile'])
        ? `${packageManager} run ${findScript(scripts, ['build', 'compile'])}`
        : getDefault(language, 'build');
    }

    if (stackProfile.testing) {
      const unitTest = stackProfile.testing.find((t) => t.type === 'unit');
      const e2eTest = stackProfile.testing.find((t) => t.type === 'e2e');

      commands.test_framework = unitTest?.name || 'jest';
      commands.e2e_framework = e2eTest?.name || null;
    }
  }

  if (language === 'python') {
    commands.lint_command = 'ruff check .';
    commands.format_command = 'black .';
    commands.type_check_command = 'mypy .';
    commands.unit_test_command = 'pytest tests/';
    commands.coverage_command = 'pytest --cov=src tests/';
    commands.test_framework = 'pytest';

    if (stackProfile.backend?.framework === 'django') {
      commands.unit_test_command = 'python manage.py test';
      commands.coverage_command = 'coverage run manage.py test && coverage report';
      commands.build_command = 'python manage.py collectstatic --noinput';
    } else {
      commands.build_command = 'python -m build';
    }
  }

  return commands;
}

module.exports = {
  extractCommandsForLanguage,
  getDefault,
  DEFAULT_COMMANDS
};
