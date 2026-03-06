#!/usr/bin/env node

/**
 * E2E Framework Initialization Utility
 *
 * Automatically initializes Playwright (or other E2E frameworks) for frontend projects
 * when no existing E2E framework is detected.
 *
 * Usage:
 *   node utils/init-e2e-framework.js [projectPath] [--framework playwright|cypress]
 *
 * @version 1.0.0
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { detectPackageManager } = require('./stack-detection');

// Configuration
const SUPPORTED_FRAMEWORKS = ['playwright', 'cypress'];
const DEFAULT_FRAMEWORK = 'playwright';

/**
 * Main entry point for E2E framework initialization
 * @param {string} projectPath - Absolute path to project root
 * @param {string} framework - E2E framework to initialize (default: playwright)
 * @returns {Promise<Object>} Initialization report
 */
async function initE2EFramework(projectPath, framework = DEFAULT_FRAMEWORK) {
  console.log('🎭 E2E Framework Initialization');
  console.log('==============================\n');

  // Validate inputs
  if (!fs.existsSync(projectPath)) {
    throw new Error(`Project path does not exist: ${projectPath}`);
  }

  if (!SUPPORTED_FRAMEWORKS.includes(framework)) {
    throw new Error(`Unsupported framework: ${framework}. Supported: ${SUPPORTED_FRAMEWORKS.join(', ')}`);
  }

  console.log(`📁 Project: ${projectPath}`);
  console.log(`🎯 Framework: ${framework}\n`);

  const report = {
    framework,
    projectPath,
    steps: [],
    success: false,
    error: null
  };

  try {
    // Step 1: Detect package manager
    const packageManager = await detectPackageManager(projectPath);
    if (!packageManager) {
      throw new Error('No package manager detected (package.json not found)');
    }
    report.packageManager = packageManager;
    report.steps.push({ step: 'detect_package_manager', success: true, message: `Detected: ${packageManager}` });
    console.log(`✓ Package manager: ${packageManager}`);

    // Step 2: Install E2E framework
    if (framework === 'playwright') {
      await initPlaywright(projectPath, packageManager, report);
    } else if (framework === 'cypress') {
      await initCypress(projectPath, packageManager, report);
    }

    report.success = true;
    console.log('\n✅ E2E framework initialized successfully!\n');

    return report;
  } catch (error) {
    report.error = error.message;
    report.steps.push({ step: 'error', success: false, message: error.message });
    console.error(`\n❌ Initialization failed: ${error.message}\n`);
    throw error;
  }
}

/**
 * Initialize Playwright for the project
 */
async function initPlaywright(projectPath, packageManager, report) {
  console.log('\n📦 Installing Playwright...');

  // Step 1: Install @playwright/test
  try {
    const installCommand = getInstallCommand(packageManager, '@playwright/test', true);
    console.log(`   Running: ${installCommand}`);
    execSync(installCommand, { cwd: projectPath, stdio: 'inherit' });
    report.steps.push({ step: 'install_playwright', success: true, message: '@playwright/test installed' });
  } catch (error) {
    throw new Error(`Failed to install @playwright/test: ${error.message}`);
  }

  // Step 2: Install browsers
  console.log('\n🌐 Installing Playwright browsers...');
  try {
    execSync('npx playwright install --with-deps chromium', { cwd: projectPath, stdio: 'inherit' });
    report.steps.push({ step: 'install_browsers', success: true, message: 'Chromium browser installed' });
  } catch (error) {
    console.warn('⚠️  Browser installation failed (non-fatal):', error.message);
    report.steps.push({ step: 'install_browsers', success: false, message: 'Browser installation skipped' });
  }

  // Step 3: Create playwright.config.ts
  console.log('\n📝 Creating playwright.config.ts...');
  const configPath = path.join(projectPath, 'playwright.config.ts');
  if (fs.existsSync(configPath)) {
    console.log('   ⚠️  playwright.config.ts already exists, skipping');
    report.steps.push({ step: 'create_config', success: false, message: 'Config already exists' });
  } else {
    const config = generatePlaywrightConfig();
    fs.writeFileSync(configPath, config, 'utf-8');
    console.log('   ✓ Created playwright.config.ts');
    report.steps.push({ step: 'create_config', success: true, message: 'playwright.config.ts created' });
  }

  // Step 4: Create e2e directory with example test
  console.log('\n📂 Creating e2e directory...');
  const e2eDir = path.join(projectPath, 'e2e');
  if (!fs.existsSync(e2eDir)) {
    fs.mkdirSync(e2eDir, { recursive: true });
    console.log('   ✓ Created e2e/');
    report.steps.push({ step: 'create_e2e_dir', success: true, message: 'e2e/ directory created' });
  } else {
    console.log('   ⚠️  e2e/ already exists');
    report.steps.push({ step: 'create_e2e_dir', success: false, message: 'e2e/ already exists' });
  }

  // Step 5: Create example test
  const exampleTestPath = path.join(e2eDir, 'example.spec.ts');
  if (!fs.existsSync(exampleTestPath)) {
    const exampleTest = generatePlaywrightExampleTest();
    fs.writeFileSync(exampleTestPath, exampleTest, 'utf-8');
    console.log('   ✓ Created e2e/example.spec.ts');
    report.steps.push({ step: 'create_example_test', success: true, message: 'Example test created' });
  } else {
    console.log('   ⚠️  e2e/example.spec.ts already exists');
    report.steps.push({ step: 'create_example_test', success: false, message: 'Example test already exists' });
  }

  // Step 6: Update package.json scripts
  console.log('\n📜 Updating package.json scripts...');
  try {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    if (!packageJson.scripts) {
      packageJson.scripts = {};
    }

    // Add E2E scripts if they don't exist
    const scriptsAdded = [];
    if (!packageJson.scripts['test:e2e']) {
      packageJson.scripts['test:e2e'] = 'playwright test';
      scriptsAdded.push('test:e2e');
    }
    if (!packageJson.scripts['test:e2e:ui']) {
      packageJson.scripts['test:e2e:ui'] = 'playwright test --ui';
      scriptsAdded.push('test:e2e:ui');
    }
    if (!packageJson.scripts['test:e2e:headed']) {
      packageJson.scripts['test:e2e:headed'] = 'playwright test --headed';
      scriptsAdded.push('test:e2e:headed');
    }

    if (scriptsAdded.length > 0) {
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
      console.log(`   ✓ Added scripts: ${scriptsAdded.join(', ')}`);
      report.steps.push({ step: 'update_package_scripts', success: true, message: `Scripts added: ${scriptsAdded.join(', ')}` });
    } else {
      console.log('   ⚠️  Scripts already exist');
      report.steps.push({ step: 'update_package_scripts', success: false, message: 'Scripts already exist' });
    }
  } catch (error) {
    console.warn(`   ⚠️  Failed to update package.json: ${error.message}`);
    report.steps.push({ step: 'update_package_scripts', success: false, message: error.message });
  }

  // Step 7: Create .gitignore entries
  console.log('\n📝 Updating .gitignore...');
  try {
    const gitignorePath = path.join(projectPath, '.gitignore');
    let gitignoreContent = '';

    if (fs.existsSync(gitignorePath)) {
      gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
    }

    const playwrightIgnores = [
      '# Playwright',
      'test-results/',
      'playwright-report/',
      'playwright/.cache/'
    ];

    let added = false;
    for (const ignore of playwrightIgnores) {
      if (!gitignoreContent.includes(ignore)) {
        gitignoreContent += `\n${ignore}`;
        added = true;
      }
    }

    if (added) {
      fs.writeFileSync(gitignorePath, gitignoreContent, 'utf-8');
      console.log('   ✓ Updated .gitignore');
      report.steps.push({ step: 'update_gitignore', success: true, message: '.gitignore updated' });
    } else {
      console.log('   ⚠️  .gitignore already contains Playwright entries');
      report.steps.push({ step: 'update_gitignore', success: false, message: 'Entries already exist' });
    }
  } catch (error) {
    console.warn(`   ⚠️  Failed to update .gitignore: ${error.message}`);
    report.steps.push({ step: 'update_gitignore', success: false, message: error.message });
  }
}

/**
 * Initialize Cypress for the project
 */
async function initCypress(projectPath, packageManager, report) {
  console.log('\n📦 Installing Cypress...');

  // Step 1: Install cypress
  try {
    const installCommand = getInstallCommand(packageManager, 'cypress', true);
    console.log(`   Running: ${installCommand}`);
    execSync(installCommand, { cwd: projectPath, stdio: 'inherit' });
    report.steps.push({ step: 'install_cypress', success: true, message: 'cypress installed' });
  } catch (error) {
    throw new Error(`Failed to install cypress: ${error.message}`);
  }

  // Step 2: Run cypress open to initialize
  console.log('\n⚙️  Initializing Cypress...');
  try {
    // This will create cypress.config.js and cypress/ directory
    execSync('npx cypress install', { cwd: projectPath, stdio: 'inherit' });
    report.steps.push({ step: 'init_cypress', success: true, message: 'Cypress initialized' });
  } catch (error) {
    console.warn('⚠️  Cypress initialization warning (non-fatal):', error.message);
    report.steps.push({ step: 'init_cypress', success: false, message: 'Initialization skipped' });
  }

  // Step 3: Update package.json scripts
  console.log('\n📜 Updating package.json scripts...');
  try {
    const packageJsonPath = path.join(projectPath, 'package.json');
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

    if (!packageJson.scripts) {
      packageJson.scripts = {};
    }

    const scriptsAdded = [];
    if (!packageJson.scripts['test:e2e']) {
      packageJson.scripts['test:e2e'] = 'cypress run';
      scriptsAdded.push('test:e2e');
    }
    if (!packageJson.scripts['test:e2e:open']) {
      packageJson.scripts['test:e2e:open'] = 'cypress open';
      scriptsAdded.push('test:e2e:open');
    }

    if (scriptsAdded.length > 0) {
      fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n', 'utf-8');
      console.log(`   ✓ Added scripts: ${scriptsAdded.join(', ')}`);
      report.steps.push({ step: 'update_package_scripts', success: true, message: `Scripts added: ${scriptsAdded.join(', ')}` });
    } else {
      console.log('   ⚠️  Scripts already exist');
      report.steps.push({ step: 'update_package_scripts', success: false, message: 'Scripts already exist' });
    }
  } catch (error) {
    console.warn(`   ⚠️  Failed to update package.json: ${error.message}`);
    report.steps.push({ step: 'update_package_scripts', success: false, message: error.message });
  }
}

/**
 * Generate install command based on package manager
 */
function getInstallCommand(packageManager, packageName, isDev = false) {
  const devFlag = isDev ? '-D' : '';

  switch (packageManager) {
    case 'pnpm':
      return `pnpm add ${devFlag} ${packageName}`;
    case 'yarn':
      return `yarn add ${devFlag} ${packageName}`;
    case 'npm':
      return isDev ? `npm install --save-dev ${packageName}` : `npm install ${packageName}`;
    case 'bun':
      return `bun add ${devFlag} ${packageName}`;
    default:
      return `npm install ${isDev ? '--save-dev' : ''} ${packageName}`;
  }
}

/**
 * Generate Playwright configuration file
 */
function generatePlaywrightConfig() {
  return `import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E Test Configuration
 *
 * Generated by AI Framework - E2E Framework Initializer
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',

  /* Run tests in files in parallel */
  fullyParallel: true,

  /* Fail the build on CI if you accidentally left test.only in the source code */
  forbidOnly: !!process.env.CI,

  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,

  /* Opt out of parallel tests on CI */
  workers: process.env.CI ? 1 : undefined,

  /* Reporter to use */
  reporter: [
    ['html', { open: 'never' }],
    ['json', { outputFile: 'test-results/e2e-results.json' }],
    ['list']
  ],

  /* Shared settings for all the projects below */
  use: {
    /* Base URL to use in actions like \`await page.goto('/')\` */
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

    /* Collect trace when retrying the failed test */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Video on failure */
    video: 'retain-on-failure',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    /* Uncomment to test on other browsers */
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },

    /* Test against mobile viewports */
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },
  ],

  /* Run your local dev server before starting the tests */
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:3000',
  //   reuseExistingServer: !process.env.CI,
  // },
});
`;
}

/**
 * Generate example Playwright test
 */
function generatePlaywrightExampleTest() {
  return `import { test, expect } from '@playwright/test';

/**
 * Example E2E Test
 *
 * Generated by AI Framework - E2E Framework Initializer
 * Replace this with your actual E2E tests.
 */
test.describe('Example E2E Test Suite', () => {
  test('should load the homepage', async ({ page }) => {
    // Navigate to the homepage
    await page.goto('/');

    // Wait for page to load
    await page.waitForLoadState('networkidle');

    // Example assertion - update this to match your app
    await expect(page).toHaveTitle(/./);
  });

  test('should navigate between pages', async ({ page }) => {
    await page.goto('/');

    // Example navigation test - update selectors to match your app
    // await page.click('text=About');
    // await expect(page).toHaveURL(/.*about/);
  });
});
`;
}

/**
 * CLI execution
 */
async function main() {
  const projectPath = process.argv[2] || process.cwd();
  const frameworkArg = process.argv.find(arg => arg.startsWith('--framework='));
  const framework = frameworkArg ? frameworkArg.split('=')[1] : DEFAULT_FRAMEWORK;

  try {
    const report = await initE2EFramework(projectPath, framework);

    console.log('📊 Initialization Report');
    console.log('========================');
    console.log(`Framework: ${report.framework}`);
    console.log(`Project: ${report.projectPath}`);
    console.log(`Package Manager: ${report.packageManager}`);
    console.log(`\nSteps:`);
    report.steps.forEach(step => {
      const icon = step.success ? '✓' : '⚠️';
      console.log(`  ${icon} ${step.step}: ${step.message}`);
    });

    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

module.exports = {
  initE2EFramework,
  initPlaywright,
  initCypress
};
