import { describe, it, expect } from 'vitest';
import { UIVisualTestingConfigSchema } from '../../../src/schemas/ui-visual-testing.schema.js';

describe('UIVisualTestingConfigSchema', () => {
  const validConfig = {
    figma: { fileKey: 'kIL8VilTn17FQcjchmCj4o' },
    thresholds: { figma: 2, regression: 5 },
    maxIterations: 3,
    screens: [
      {
        label: 'Set Password – Desktop',
        figmaNodeId: '191-19365',
        route: '/set-password?token=valid-test-token',
        viewport: { width: 1440, height: 900 },
        modes: ['figma', 'screenshot'],
      },
    ],
  };

  it('parses a valid config', () => {
    const result = UIVisualTestingConfigSchema.parse(validConfig);
    expect(result.screens).toHaveLength(1);
    expect(result.thresholds.figma).toBe(2);
    expect(result.thresholds.regression).toBe(5);
    expect(result.maxIterations).toBe(3);
  });

  it('applies default thresholds', () => {
    const config = {
      screens: [
        { label: 'Home', route: '/', viewport: { width: 1440, height: 900 } },
      ],
    };
    const result = UIVisualTestingConfigSchema.parse(config);
    expect(result.thresholds.figma).toBe(2);
    expect(result.thresholds.regression).toBe(5);
  });

  it('applies default maxIterations', () => {
    const config = {
      screens: [
        { label: 'Home', route: '/', viewport: { width: 1440, height: 900 } },
      ],
    };
    const result = UIVisualTestingConfigSchema.parse(config);
    expect(result.maxIterations).toBe(3);
  });

  it('applies default modes to screen entries', () => {
    const config = {
      screens: [
        { label: 'Home', route: '/', viewport: { width: 1440, height: 900 } },
      ],
    };
    const result = UIVisualTestingConfigSchema.parse(config);
    expect(result.screens[0].modes).toEqual(['figma', 'screenshot']);
  });

  it('allows optional fields', () => {
    const config = {
      $schema: 'https://example.com/schema.json',
      figma: { fileKey: 'abc', accessMethod: 'mcp' as const },
      screens: [
        {
          label: 'Dashboard',
          route: '/dashboard',
          viewport: { width: 1440, height: 900 },
          captureSelector: '#main-content',
          waitForSelector: '[data-loaded="true"]',
          delay: 1000,
          figmaNodeId: '1-23',
          modes: ['screenshot' as const],
          ignoreRegions: [{ x: 10, y: 20, width: 100, height: 50, reason: 'timestamp' }],
        },
      ],
    };
    const result = UIVisualTestingConfigSchema.parse(config);
    expect(result.screens[0].captureSelector).toBe('#main-content');
    expect(result.screens[0].waitForSelector).toBe('[data-loaded="true"]');
    expect(result.screens[0].delay).toBe(1000);
    expect(result.screens[0].ignoreRegions).toHaveLength(1);
  });

  it('rejects empty screens array', () => {
    expect(() =>
      UIVisualTestingConfigSchema.parse({ screens: [] }),
    ).toThrow();
  });

  it('rejects missing route', () => {
    expect(() =>
      UIVisualTestingConfigSchema.parse({
        screens: [{ label: 'Home', viewport: { width: 1440, height: 900 } }],
      }),
    ).toThrow();
  });

  it('rejects missing label', () => {
    expect(() =>
      UIVisualTestingConfigSchema.parse({
        screens: [{ route: '/', viewport: { width: 1440, height: 900 } }],
      }),
    ).toThrow();
  });

  it('rejects viewport width below minimum', () => {
    expect(() =>
      UIVisualTestingConfigSchema.parse({
        screens: [{ label: 'Home', route: '/', viewport: { width: 100, height: 900 } }],
      }),
    ).toThrow();
  });

  it('rejects viewport height above maximum', () => {
    expect(() =>
      UIVisualTestingConfigSchema.parse({
        screens: [{ label: 'Home', route: '/', viewport: { width: 1440, height: 5000 } }],
      }),
    ).toThrow();
  });

  it('rejects maxIterations above 10', () => {
    expect(() =>
      UIVisualTestingConfigSchema.parse({
        maxIterations: 15,
        screens: [{ label: 'Home', route: '/', viewport: { width: 1440, height: 900 } }],
      }),
    ).toThrow();
  });

  it('rejects delay above 30000', () => {
    expect(() =>
      UIVisualTestingConfigSchema.parse({
        screens: [{
          label: 'Home',
          route: '/',
          viewport: { width: 1440, height: 900 },
          delay: 60000,
        }],
      }),
    ).toThrow();
  });

  it('rejects invalid mode value', () => {
    expect(() =>
      UIVisualTestingConfigSchema.parse({
        screens: [{
          label: 'Home',
          route: '/',
          viewport: { width: 1440, height: 900 },
          modes: ['invalid'],
        }],
      }),
    ).toThrow();
  });
});
