/**
 * Test Framework Detection Utility
 *
 * Detects test frameworks across multiple languages and tech stacks.
 * Supports: Jest, Vitest, Mocha, Ava, Playwright, Cypress, TestCafe, Puppeteer,
 *           Pytest, unittest, go test, JUnit (Maven/Gradle), cargo test, RSpec
 *
 * Usage:
 *   const detector = new TestFrameworkDetector('/path/to/project');
 *   const frameworks = await detector.detectAll();
 */

const fs = require('fs').promises;
const path = require('path');
const { existsSync } = require('fs');

class TestFrameworkDetector {
  constructor(projectRoot) {
    this.projectRoot = projectRoot;
    this.detectedFrameworks = {
      unit: [],
      integration: [],
      e2e: []
    };
  }

  /**
   * Detect all test frameworks in the project
   * @returns {Promise<Object>} Detected frameworks by type
   */
  async detectAll() {
    await this.detectJavaScript();
    await this.detectPython();
    await this.detectGo();
    await this.detectJava();
    await this.detectRust();
    await this.detectRuby();

    return this.detectedFrameworks;
  }

  /**
   * Detect JavaScript/TypeScript test frameworks
   */
  async detectJavaScript() {
    const packageJsonPath = path.join(this.projectRoot, 'package.json');

    if (!existsSync(packageJsonPath)) {
      return;
    }

    try {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
      const allDeps = {
        ...packageJson.dependencies,
        ...packageJson.devDependencies
      };

      // Unit/Integration Testing
      if (allDeps['jest'] || allDeps['@types/jest']) {
        this.detectedFrameworks.unit.push({
          name: 'jest',
          language: 'typescript',
          confidence: 'high',
          detectedBy: 'package.json',
          configFile: this.findConfigFile(['jest.config.js', 'jest.config.ts', 'jest.config.mjs']),
          testPattern: '**/*.{test,spec}.{js,ts,jsx,tsx}',
          runCommand: 'pnpm test:unit || npm run test:unit || npx jest',
          watchCommand: 'pnpm test:unit:watch || npm run test:unit:watch || npx jest --watch',
          coverageCommand: 'pnpm test:unit:coverage || npm run test:unit:coverage || npx jest --coverage'
        });
      }

      if (allDeps['vitest']) {
        this.detectedFrameworks.unit.push({
          name: 'vitest',
          language: 'typescript',
          confidence: 'high',
          detectedBy: 'package.json',
          configFile: this.findConfigFile(['vitest.config.js', 'vitest.config.ts', 'vite.config.ts']),
          testPattern: '**/*.{test,spec}.{js,ts,jsx,tsx}',
          runCommand: 'pnpm test:unit || npm run test:unit || npx vitest run',
          watchCommand: 'pnpm test:unit:watch || npm run test:unit:watch || npx vitest',
          coverageCommand: 'pnpm test:unit:coverage || npm run test:unit:coverage || npx vitest run --coverage'
        });
      }

      if (allDeps['mocha']) {
        this.detectedFrameworks.unit.push({
          name: 'mocha',
          language: 'typescript',
          confidence: 'high',
          detectedBy: 'package.json',
          configFile: this.findConfigFile(['.mocharc.js', '.mocharc.json']),
          testPattern: 'test/**/*.{js,ts}',
          runCommand: 'pnpm test || npm test || npx mocha',
          watchCommand: 'pnpm test:watch || npm run test:watch || npx mocha --watch',
          coverageCommand: 'pnpm test:coverage || npm run test:coverage || npx nyc mocha'
        });
      }

      if (allDeps['ava']) {
        this.detectedFrameworks.unit.push({
          name: 'ava',
          language: 'typescript',
          confidence: 'high',
          detectedBy: 'package.json',
          configFile: this.findConfigFile(['ava.config.js', 'ava.config.mjs']),
          testPattern: 'test/**/*.{js,ts}',
          runCommand: 'pnpm test || npm test || npx ava',
          watchCommand: 'pnpm test:watch || npm run test:watch || npx ava --watch',
          coverageCommand: 'pnpm test:coverage || npm run test:coverage || npx nyc ava'
        });
      }

      // E2E Testing
      if (allDeps['@playwright/test'] || allDeps['playwright']) {
        this.detectedFrameworks.e2e.push({
          name: 'playwright',
          language: 'typescript',
          confidence: 'high',
          detectedBy: 'package.json',
          configFile: this.findConfigFile(['playwright.config.js', 'playwright.config.ts']),
          testPattern: 'tests/**/*.{test,spec}.{js,ts}',
          runCommand: 'pnpm test:e2e || npm run test:e2e || npx playwright test',
          headedCommand: 'pnpm test:e2e:headed || npm run test:e2e:headed || npx playwright test --headed',
          debugCommand: 'pnpm test:e2e:debug || npm run test:e2e:debug || npx playwright test --debug',
          uiCommand: 'npx playwright test --ui',
          recordingEnabled: true
        });
      }

      if (allDeps['cypress']) {
        this.detectedFrameworks.e2e.push({
          name: 'cypress',
          language: 'typescript',
          confidence: 'high',
          detectedBy: 'package.json',
          configFile: this.findConfigFile(['cypress.config.js', 'cypress.config.ts']),
          testPattern: 'cypress/e2e/**/*.cy.{js,ts}',
          runCommand: 'pnpm test:e2e || npm run test:e2e || npx cypress run',
          headedCommand: 'pnpm test:e2e:headed || npm run test:e2e:headed || npx cypress open',
          recordingEnabled: true
        });
      }

      if (allDeps['testcafe']) {
        this.detectedFrameworks.e2e.push({
          name: 'testcafe',
          language: 'typescript',
          confidence: 'high',
          detectedBy: 'package.json',
          configFile: this.findConfigFile(['.testcaferc.json']),
          testPattern: 'tests/**/*.{test,spec}.{js,ts}',
          runCommand: 'pnpm test:e2e || npm run test:e2e || npx testcafe',
          recordingEnabled: false
        });
      }

      if (allDeps['puppeteer']) {
        this.detectedFrameworks.e2e.push({
          name: 'puppeteer',
          language: 'typescript',
          confidence: 'medium',
          detectedBy: 'package.json',
          configFile: null,
          testPattern: 'tests/**/*.{test,spec}.{js,ts}',
          runCommand: 'pnpm test:e2e || npm run test:e2e',
          recordingEnabled: false
        });
      }

    } catch (error) {
      console.error(`Error detecting JavaScript frameworks: ${error.message}`);
    }
  }

  /**
   * Detect Python test frameworks
   */
  async detectPython() {
    const indicators = [
      'pyproject.toml',
      'setup.py',
      'requirements.txt',
      'requirements-dev.txt',
      'Pipfile'
    ];

    const hasPython = indicators.some(file =>
      existsSync(path.join(this.projectRoot, file))
    );

    if (!hasPython) {
      return;
    }

    // Check for pytest
    const pytestConfig = this.findConfigFile([
      'pytest.ini',
      'pyproject.toml',
      'setup.cfg'
    ]);

    if (pytestConfig || existsSync(path.join(this.projectRoot, 'tests'))) {
      this.detectedFrameworks.unit.push({
        name: 'pytest',
        language: 'python',
        confidence: pytestConfig ? 'high' : 'medium',
        detectedBy: pytestConfig || 'tests/ directory',
        configFile: pytestConfig,
        testPattern: 'tests/**/*_test.py or tests/**/test_*.py',
        runCommand: 'pytest',
        watchCommand: 'pytest-watch || ptw',
        coverageCommand: 'pytest --cov=. --cov-report=html'
      });
    }

    // Check for unittest (standard library)
    const hasTestsDir = existsSync(path.join(this.projectRoot, 'tests'));
    if (hasTestsDir && this.detectedFrameworks.unit.every(f => f.name !== 'pytest')) {
      this.detectedFrameworks.unit.push({
        name: 'unittest',
        language: 'python',
        confidence: 'medium',
        detectedBy: 'tests/ directory',
        configFile: null,
        testPattern: 'tests/**/*_test.py or tests/**/test_*.py',
        runCommand: 'python -m unittest discover',
        watchCommand: null,
        coverageCommand: 'coverage run -m unittest discover && coverage html'
      });
    }
  }

  /**
   * Detect Go test framework
   */
  async detectGo() {
    const goModPath = path.join(this.projectRoot, 'go.mod');

    if (!existsSync(goModPath)) {
      return;
    }

    this.detectedFrameworks.unit.push({
      name: 'go-test',
      language: 'go',
      confidence: 'high',
      detectedBy: 'go.mod',
      configFile: null,
      testPattern: '**/*_test.go',
      runCommand: 'go test ./...',
      watchCommand: 'go test ./... -v',
      coverageCommand: 'go test ./... -coverprofile=coverage.out && go tool cover -html=coverage.out'
    });
  }

  /**
   * Detect Java test frameworks (JUnit with Maven/Gradle)
   */
  async detectJava() {
    const pomPath = path.join(this.projectRoot, 'pom.xml');
    const gradlePath = this.findConfigFile(['build.gradle', 'build.gradle.kts']);

    if (!pomPath && !gradlePath) {
      return;
    }

    if (existsSync(pomPath)) {
      try {
        const pomContent = await fs.readFile(pomPath, 'utf-8');
        if (pomContent.includes('junit')) {
          this.detectedFrameworks.unit.push({
            name: 'junit',
            language: 'java',
            confidence: 'high',
            detectedBy: 'pom.xml',
            buildTool: 'maven',
            configFile: pomPath,
            testPattern: 'src/test/java/**/*Test.java',
            runCommand: './mvnw test || mvn test',
            coverageCommand: './mvnw jacoco:report || mvn jacoco:report'
          });
        }
      } catch (error) {
        console.error(`Error reading pom.xml: ${error.message}`);
      }
    }

    if (gradlePath) {
      try {
        const gradleContent = await fs.readFile(gradlePath, 'utf-8');
        if (gradleContent.includes('junit')) {
          this.detectedFrameworks.unit.push({
            name: 'junit',
            language: 'java',
            confidence: 'high',
            detectedBy: path.basename(gradlePath),
            buildTool: 'gradle',
            configFile: gradlePath,
            testPattern: 'src/test/java/**/*Test.java',
            runCommand: './gradlew test',
            coverageCommand: './gradlew jacocoTestReport'
          });
        }
      } catch (error) {
        console.error(`Error reading ${gradlePath}: ${error.message}`);
      }
    }
  }

  /**
   * Detect Rust test framework
   */
  async detectRust() {
    const cargoPath = path.join(this.projectRoot, 'Cargo.toml');

    if (!existsSync(cargoPath)) {
      return;
    }

    this.detectedFrameworks.unit.push({
      name: 'cargo-test',
      language: 'rust',
      confidence: 'high',
      detectedBy: 'Cargo.toml',
      configFile: cargoPath,
      testPattern: 'tests/**/*.rs or src/**/*_test.rs',
      runCommand: 'cargo test',
      watchCommand: 'cargo watch -x test',
      coverageCommand: 'cargo tarpaulin --out Html'
    });
  }

  /**
   * Detect Ruby test framework
   */
  async detectRuby() {
    const gemfilePath = path.join(this.projectRoot, 'Gemfile');

    if (!existsSync(gemfilePath)) {
      return;
    }

    try {
      const gemfileContent = await fs.readFile(gemfilePath, 'utf-8');

      if (gemfileContent.includes('rspec')) {
        this.detectedFrameworks.unit.push({
          name: 'rspec',
          language: 'ruby',
          confidence: 'high',
          detectedBy: 'Gemfile',
          configFile: this.findConfigFile(['.rspec', 'spec/spec_helper.rb']),
          testPattern: 'spec/**/*_spec.rb',
          runCommand: 'bundle exec rspec',
          watchCommand: 'bundle exec guard',
          coverageCommand: 'COVERAGE=true bundle exec rspec'
        });
      }
    } catch (error) {
      console.error(`Error reading Gemfile: ${error.message}`);
    }
  }

  /**
   * Find config file from a list of possible names
   * @param {string[]} possibleFiles - Array of possible config file names
   * @returns {string|null} Found config file path or null
   */
  findConfigFile(possibleFiles) {
    for (const file of possibleFiles) {
      const filePath = path.join(this.projectRoot, file);
      if (existsSync(filePath)) {
        return file;
      }
    }
    return null;
  }

  /**
   * Get summary of detected frameworks
   * @returns {Object} Summary with counts by type
   */
  getSummary() {
    return {
      unit: {
        count: this.detectedFrameworks.unit.length,
        frameworks: this.detectedFrameworks.unit.map(f => f.name)
      },
      integration: {
        count: this.detectedFrameworks.integration.length,
        frameworks: this.detectedFrameworks.integration.length.map(f => f.name)
      },
      e2e: {
        count: this.detectedFrameworks.e2e.length,
        frameworks: this.detectedFrameworks.e2e.map(f => f.name)
      }
    };
  }

  /**
   * Check if a specific framework is detected
   * @param {string} frameworkName - Name of the framework
   * @returns {Object|null} Framework config or null
   */
  hasFramework(frameworkName) {
    const allFrameworks = [
      ...this.detectedFrameworks.unit,
      ...this.detectedFrameworks.integration,
      ...this.detectedFrameworks.e2e
    ];

    return allFrameworks.find(f => f.name === frameworkName) || null;
  }
}

module.exports = { TestFrameworkDetector };
