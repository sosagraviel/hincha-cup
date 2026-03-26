# Playwright Component Testing Reference

This document covers the setup, configuration, and usage patterns for Playwright Component Testing (CT) across supported frameworks.

## Overview

Playwright Component Testing allows mounting individual components in a real browser, testing them in isolation without a full application server. This is Level 2 in the testing pyramid — between unit tests (JSDOM) and full E2E tests.

### When to use CT vs full-page capture

| Use CT when... | Use full-page capture when... |
|----------------|-------------------------------|
| Testing a component in isolation | Testing a complete page with routing |
| Component has multiple visual states to verify | Page requires API responses and auth |
| You need to test responsive behaviour of a single component | You need to verify component integration in context |
| The component is reusable across multiple pages | The test covers a user flow spanning multiple pages |
| You want fast iteration (no server needed) | You need to test SSR/hydration behaviour |
| Testing design system atoms and molecules | Testing full-page layouts and compositions |

## Installation

### React

```bash
pnpm add -D @playwright/experimental-ct-react
pnpm exec playwright install chromium
```

### Vue

```bash
pnpm add -D @playwright/experimental-ct-vue
pnpm exec playwright install chromium
```

### Svelte

```bash
pnpm add -D @playwright/experimental-ct-svelte
pnpm exec playwright install chromium
```

### Angular

Playwright CT does not have an official Angular adapter. For Angular projects, use full-page capture with isolated routes or Storybook integration instead.

## Config Template

### `playwright-ct.config.ts`

```typescript
import { defineConfig, devices } from '@playwright/experimental-ct-react';
// For Vue: import from '@playwright/experimental-ct-vue'
// For Svelte: import from '@playwright/experimental-ct-svelte'
import path from 'path';

export default defineConfig({
  testDir: './src/__tests__/component',
  snapshotDir: './__screenshots__/components',

  // Timeout per test
  timeout: 30_000,

  // Fail the build on CI if test.only is left in source
  forbidOnly: !!process.env.CI,

  // Retry on CI only
  retries: process.env.CI ? 2 : 0,

  // Reporter
  reporter: process.env.CI ? 'github' : 'html',

  use: {
    // Collect trace on first retry
    trace: 'on-first-retry',

    // Screenshot on failure
    screenshot: 'only-on-failure',

    // CT-specific: configure the bundler
    ctPort: 3100,
    ctViteConfig: {
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        },
      },
    },
  },

  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-tablet',
      use: { ...devices['iPad (gen 7)'] },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['iPhone 13'] },
    },
  ],
});
```

### Key config notes

- **`ctViteConfig`**: Playwright CT uses Vite under the hood for bundling. Pass your path aliases and any Vite plugins needed here.
- **`ctPort`**: The port for the CT dev server. Choose a port that does not conflict with your application dev server.
- **`snapshotDir`**: Where visual comparison snapshots are stored. Keep separate from E2E screenshots.

## Mounting Components with Props

### Basic mounting

```typescript
import { test, expect } from '@playwright/experimental-ct-react';
import { KpiCard } from '@/entities/kpi/ui/KpiCard';

test('renders KPI card with data', async ({ mount }) => {
  const component = await mount(
    <KpiCard
      label="Revenue"
      value={1250000}
      currency="USD"
      trend={{ direction: 'up', percentage: 12.5 }}
    />
  );

  await expect(component).toContainText('Revenue');
  await expect(component).toContainText('$1,250,000');
  await expect(component).toContainText('+12.5%');
});
```

### Mounting with context providers

Many components require React context (theme, auth, router). Use a wrapper:

```typescript
// src/__tests__/component/test-utils.tsx
import { ThemeProvider } from '@/shared/ui/ThemeProvider';

export function TestWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider defaultTheme="light">
      {children}
    </ThemeProvider>
  );
}
```

```typescript
import { test, expect } from '@playwright/experimental-ct-react';
import { KpiCard } from '@/entities/kpi/ui/KpiCard';
import { TestWrapper } from './test-utils';

test('renders with theme context', async ({ mount }) => {
  const component = await mount(
    <TestWrapper>
      <KpiCard label="Revenue" value={1250000} currency="USD" />
    </TestWrapper>
  );

  await expect(component).toBeVisible();
});
```

### Testing event handlers

```typescript
test('calls onClick when card is clicked', async ({ mount }) => {
  let clicked = false;

  const component = await mount(
    <KpiCard
      label="Revenue"
      value={1250000}
      currency="USD"
      onClick={() => { clicked = true; }}
    />
  );

  await component.click();
  expect(clicked).toBe(true);
});
```

### Testing multiple states

```typescript
test.describe('Badge component', () => {
  const variants = ['success', 'warning', 'error', 'info'] as const;

  for (const variant of variants) {
    test(`renders ${variant} variant`, async ({ mount }) => {
      const component = await mount(
        <Badge variant={variant} label={`${variant} badge`} />
      );

      await expect(component).toBeVisible();
      await expect(component).toHaveScreenshot(`badge-${variant}.png`);
    });
  }

  test('renders disabled state', async ({ mount }) => {
    const component = await mount(
      <Badge variant="success" label="Disabled" disabled />
    );

    await expect(component).toHaveCSS('opacity', '0.5');
  });

  test('renders loading state', async ({ mount }) => {
    const component = await mount(
      <Badge variant="success" label="Loading" loading />
    );

    await expect(component.locator('[data-testid="spinner"]')).toBeVisible();
  });
});
```

## Capturing Component Screenshots in Isolation

### Basic screenshot comparison

```typescript
test('matches visual snapshot', async ({ mount }) => {
  const component = await mount(
    <KpiCard label="Revenue" value={1250000} currency="USD" />
  );

  // Disable animations before capture
  await component.evaluate(el => {
    const style = document.createElement('style');
    style.textContent = '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }';
    document.head.appendChild(style);
  });

  await expect(component).toHaveScreenshot('kpi-card-default.png', {
    maxDiffPixelRatio: 0.02,
  });
});
```

### Screenshot with interaction states

```typescript
test('hover state matches snapshot', async ({ mount }) => {
  const component = await mount(
    <KpiCard label="Revenue" value={1250000} currency="USD" interactive />
  );

  // Capture default state
  await expect(component).toHaveScreenshot('kpi-card-idle.png');

  // Hover and capture
  await component.hover();
  await expect(component).toHaveScreenshot('kpi-card-hover.png');

  // Focus and capture
  await component.focus();
  await expect(component).toHaveScreenshot('kpi-card-focus.png');
});
```

### Screenshots with custom pixelmatch options

```typescript
test('matches design with custom threshold', async ({ mount }) => {
  const component = await mount(
    <KpiCard label="Revenue" value={1250000} currency="USD" />
  );

  await expect(component).toHaveScreenshot('kpi-card.png', {
    maxDiffPixelRatio: 0.01,  // Stricter than default
    threshold: 0.1,            // pixelmatch sensitivity
    animations: 'disabled',    // Built-in animation disabling
  });
});
```

## Multi-Viewport Component Testing

### Using Playwright projects

The config template above defines three projects (desktop, tablet, mobile). Each test automatically runs at all three viewport sizes.

### Explicit viewport testing within a single test

For cases where you need to test specific viewport transitions:

```typescript
test('responsive layout changes', async ({ mount, page }) => {
  const component = await mount(
    <KpiDashboard kpis={mockKpis} />
  );

  // Desktop: 4-column grid
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(component).toHaveScreenshot('dashboard-desktop.png');

  // Tablet: 2-column grid
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(component).toHaveScreenshot('dashboard-tablet.png');

  // Mobile: single column
  await page.setViewportSize({ width: 375, height: 667 });
  await expect(component).toHaveScreenshot('dashboard-mobile.png');
});
```

### Testing responsive behaviour logic

```typescript
test('collapses sidebar on mobile viewport', async ({ mount, page }) => {
  await page.setViewportSize({ width: 375, height: 667 });

  const component = await mount(
    <NavigationSidebar items={mockNavItems} />
  );

  // Sidebar should be collapsed on mobile
  await expect(component.locator('[data-testid="sidebar-expanded"]')).not.toBeVisible();
  await expect(component.locator('[data-testid="sidebar-toggle"]')).toBeVisible();

  // Click toggle to expand
  await component.locator('[data-testid="sidebar-toggle"]').click();
  await expect(component.locator('[data-testid="sidebar-expanded"]')).toBeVisible();
});
```

## Framework-Specific Mounting

### Vue mounting

```typescript
import { test, expect } from '@playwright/experimental-ct-vue';
import KpiCard from '@/entities/kpi/ui/KpiCard.vue';

test('renders KPI card', async ({ mount }) => {
  const component = await mount(KpiCard, {
    props: {
      label: 'Revenue',
      value: 1250000,
      currency: 'USD',
    },
  });

  await expect(component).toContainText('Revenue');
});
```

### Svelte mounting

```typescript
import { test, expect } from '@playwright/experimental-ct-svelte';
import KpiCard from '@/entities/kpi/ui/KpiCard.svelte';

test('renders KPI card', async ({ mount }) => {
  const component = await mount(KpiCard, {
    props: {
      label: 'Revenue',
      value: 1250000,
      currency: 'USD',
    },
  });

  await expect(component).toContainText('Revenue');
});
```

## Accessibility Testing with CT

Integrate axe-core for accessibility validation in component tests:

```bash
pnpm add -D @axe-core/playwright
```

```typescript
import { test, expect } from '@playwright/experimental-ct-react';
import AxeBuilder from '@axe-core/playwright';
import { KpiCard } from '@/entities/kpi/ui/KpiCard';

test('has no accessibility violations', async ({ mount, page }) => {
  await mount(
    <KpiCard label="Revenue" value={1250000} currency="USD" />
  );

  const accessibilityScanResults = await new AxeBuilder({ page })
    .include('[data-testid="kpi-card"]')
    .analyze();

  expect(accessibilityScanResults.violations).toEqual([]);
});
```

## Directory Structure

Recommended test file organisation:

```
src/__tests__/component/
├── entities/
│   ├── kpi/
│   │   └── KpiCard.spec.tsx
│   └── insight/
│       └── InsightCard.spec.tsx
├── shared/
│   └── ui/
│       ├── Badge.spec.tsx
│       ├── Button.spec.tsx
│       └── Tooltip.spec.tsx
├── widgets/
│   ├── KpiDashboard.spec.tsx
│   └── InsightPanel.spec.tsx
└── test-utils.tsx
```

Test files use `.spec.tsx` extension to distinguish from unit tests (`.test.tsx`).
