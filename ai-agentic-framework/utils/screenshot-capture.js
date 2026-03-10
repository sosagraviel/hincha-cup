/**
 * Screenshot Capture Utility
 *
 * Playwright-based screenshot capture with authentication handling.
 * Captures screenshots of pages for visual verification.
 *
 * Usage:
 *   const capture = new ScreenshotCapture('http://localhost:3000', authConfig, 'PROJ-123');
 *   await capture.captureAllPages(pages, 'before');
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs').promises;
const { existsSync } = require('fs');

class ScreenshotCapture {
  constructor(baseUrl, authConfig, jiraKey, options = {}) {
    this.baseUrl = baseUrl;
    this.authConfig = authConfig; // { username, password, loginUrl }
    this.jiraKey = jiraKey;
    this.options = {
      headless: options.headless !== false,
      slowMo: options.slowMo || 0,
      timeout: options.timeout || 30000,
      ...options
    };
    this.browser = null;
    this.context = null;
    this.page = null;
    this.screenshotsDir = path.join(options.projectRoot || process.cwd(), `.claude/screenshots/${jiraKey}`);
  }

  /**
   * Initialize browser and authenticate
   */
  async initialize() {
    console.log('[ScreenshotCapture] Initializing browser...');

    this.browser = await chromium.launch({
      headless: this.options.headless,
      slowMo: this.options.slowMo
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1920, height: 1080 }
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(this.options.timeout);

    // Authenticate if config provided
    if (this.authConfig && this.authConfig.loginUrl) {
      await this.authenticate();
    }

    console.log('[ScreenshotCapture] Browser initialized');
  }

  /**
   * Authenticate user
   */
  async authenticate() {
    console.log('[ScreenshotCapture] Authenticating...');

    try {
      await this.page.goto(this.authConfig.loginUrl);

      // Wait for login form
      await this.page.waitForLoadState('networkidle');

      // Fill credentials (adjust selectors based on your login form)
      await this.page.fill('input[name="username"], input[type="email"], #username, #email', this.authConfig.username);
      await this.page.fill('input[name="password"], input[type="password"], #password', this.authConfig.password);

      // Submit form
      await this.page.click('button[type="submit"], button:has-text("Sign in"), button:has-text("Login")');

      // Wait for navigation
      await this.page.waitForLoadState('networkidle');

      console.log('[ScreenshotCapture] Authentication successful');
    } catch (error) {
      console.error('[ScreenshotCapture] Authentication failed:', error.message);
      throw new Error(`Authentication failed: ${error.message}`);
    }
  }

  /**
   * Capture screenshots of all specified pages
   * @param {Array} pages - Array of page configs: { route, name, viewports }
   * @param {string} stage - 'before' or 'after'
   * @returns {Promise<Array>} Array of screenshot paths
   */
  async captureAllPages(pages, stage = 'after') {
    if (!this.browser) {
      await this.initialize();
    }

    // Ensure screenshots directory exists
    await this.ensureScreenshotsDirectory();

    const screenshots = [];

    for (const pageConfig of pages) {
      console.log(`[ScreenshotCapture] Capturing ${pageConfig.name} (${stage})...`);

      try {
        const pageScreenshots = await this.capturePage(pageConfig, stage);
        screenshots.push(...pageScreenshots);
      } catch (error) {
        console.error(`[ScreenshotCapture] Error capturing ${pageConfig.name}:`, error.message);
      }
    }

    return screenshots;
  }

  /**
   * Capture screenshots of a single page across viewports
   * @param {Object} pageConfig - Page configuration
   * @param {string} stage - 'before' or 'after'
   * @returns {Promise<Array>} Array of screenshot paths
   */
  async capturePage(pageConfig, stage) {
    const url = `${this.baseUrl}${pageConfig.route}`;
    const viewports = pageConfig.viewports || ['desktop'];
    const screenshots = [];

    for (const viewport of viewports) {
      const viewportConfig = this.getViewportConfig(viewport);

      // Set viewport
      await this.context.setViewportSize(viewportConfig);

      // Navigate to page
      await this.page.goto(url);
      await this.page.waitForLoadState('networkidle');

      // Optional: wait for specific elements
      if (pageConfig.waitFor) {
        if (typeof pageConfig.waitFor === 'string') {
          await this.page.waitForSelector(pageConfig.waitFor);
        } else if (typeof pageConfig.waitFor === 'number') {
          await this.page.waitForTimeout(pageConfig.waitFor);
        }
      }

      // Optional: scroll to capture full page
      if (pageConfig.fullPage) {
        await this.scrollToBottom();
      }

      // Capture screenshot
      const fileName = this.generateFileName(pageConfig.name, viewport, stage);
      const filePath = path.join(this.screenshotsDir, stage, fileName);

      await this.page.screenshot({
        path: filePath,
        fullPage: pageConfig.fullPage || false
      });

      screenshots.push({
        fileName,
        filePath,
        relativePath: path.relative(process.cwd(), filePath),
        page: pageConfig.name,
        viewport,
        stage,
        url
      });

      console.log(`[ScreenshotCapture] Captured: ${fileName}`);
    }

    return screenshots;
  }

  /**
   * Get viewport configuration
   * @param {string} viewportName - Viewport name (desktop, tablet, mobile)
   * @returns {Object} Viewport config
   */
  getViewportConfig(viewportName) {
    const viewports = {
      desktop: { width: 1920, height: 1080 },
      laptop: { width: 1366, height: 768 },
      tablet: { width: 768, height: 1024 },
      mobile: { width: 375, height: 667 },
      'mobile-landscape': { width: 667, height: 375 }
    };

    return viewports[viewportName] || viewports.desktop;
  }

  /**
   * Scroll to bottom of page
   */
  async scrollToBottom() {
    await this.page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 100;
        const timer = setInterval(() => {
          const scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, distance);
          totalHeight += distance;

          if (totalHeight >= scrollHeight) {
            clearInterval(timer);
            resolve();
          }
        }, 100);
      });
    });
  }

  /**
   * Generate screenshot file name
   * @param {string} pageName - Page name
   * @param {string} viewport - Viewport name
   * @param {string} stage - Stage (before/after)
   * @returns {string} File name
   */
  generateFileName(pageName, viewport, stage) {
    const sanitizedPageName = pageName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const timestamp = Date.now();
    return `${sanitizedPageName}-${viewport}-${stage}-${timestamp}.png`;
  }

  /**
   * Ensure screenshots directory exists
   */
  async ensureScreenshotsDirectory() {
    const stages = ['before', 'after'];

    for (const stage of stages) {
      const stageDir = path.join(this.screenshotsDir, stage);
      if (!existsSync(stageDir)) {
        await fs.mkdir(stageDir, { recursive: true });
      }
    }
  }

  /**
   * Capture screenshot of specific element
   * @param {string} selector - Element selector
   * @param {string} fileName - File name
   * @returns {Promise<string>} Screenshot path
   */
  async captureElement(selector, fileName) {
    if (!this.browser) {
      await this.initialize();
    }

    const element = await this.page.$(selector);

    if (!element) {
      throw new Error(`Element not found: ${selector}`);
    }

    const filePath = path.join(this.screenshotsDir, fileName);
    await element.screenshot({ path: filePath });

    return filePath;
  }

  /**
   * Close browser
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      console.log('[ScreenshotCapture] Browser closed');
    }
  }

  /**
   * Cleanup screenshots for stage
   * @param {string} stage - Stage to cleanup (before/after)
   */
  async cleanup(stage) {
    const stageDir = path.join(this.screenshotsDir, stage);

    if (existsSync(stageDir)) {
      await fs.rm(stageDir, { recursive: true, force: true });
      console.log(`[ScreenshotCapture] Cleaned up ${stage} screenshots`);
    }
  }

  /**
   * Get all screenshots for stage
   * @param {string} stage - Stage (before/after)
   * @returns {Promise<Array>} Array of screenshot file paths
   */
  async getScreenshots(stage) {
    const stageDir = path.join(this.screenshotsDir, stage);

    if (!existsSync(stageDir)) {
      return [];
    }

    const files = await fs.readdir(stageDir);
    return files
      .filter(f => f.endsWith('.png'))
      .map(f => ({
        fileName: f,
        filePath: path.join(stageDir, f),
        relativePath: path.relative(process.cwd(), path.join(stageDir, f))
      }));
  }

  /**
   * Create page configuration from changed files
   * @param {Array} changedFiles - Array of changed file paths
   * @param {Object} routeMapping - Mapping of file paths to routes
   * @returns {Array} Array of page configs
   */
  static inferPagesFromChangedFiles(changedFiles, routeMapping = {}) {
    const pages = [];
    const seenRoutes = new Set();

    for (const file of changedFiles) {
      // Check if file has explicit route mapping
      if (routeMapping[file]) {
        const route = routeMapping[file];

        if (!seenRoutes.has(route)) {
          pages.push({
            route,
            name: path.basename(route) || 'index',
            viewports: ['desktop', 'mobile']
          });
          seenRoutes.add(route);
        }
        continue;
      }

      // Infer route from file path patterns
      let route = null;

      // React Router / Next.js pages
      if (file.includes('/pages/') || file.includes('/routes/')) {
        const match = file.match(/\/(pages|routes)\/(.+)\.(tsx?|jsx?)$/);
        if (match) {
          route = '/' + match[2].replace(/\/index$/, '').replace(/\[([^\]]+)\]/g, ':$1');
        }
      }

      // Component changes - try to infer from component name
      if (!route && file.includes('/components/')) {
        const componentName = path.basename(file, path.extname(file));
        // This is a guess - actual route mapping should be provided
        route = `/${componentName.toLowerCase()}`;
      }

      if (route && !seenRoutes.has(route)) {
        pages.push({
          route,
          name: path.basename(route) || componentName,
          viewports: ['desktop', 'mobile']
        });
        seenRoutes.add(route);
      }
    }

    return pages;
  }
}

module.exports = { ScreenshotCapture };
