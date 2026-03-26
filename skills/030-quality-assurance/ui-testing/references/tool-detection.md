# Tool Detection Reference

This document defines how the `ui-testing` skill detects, validates, and suggests installation of testing tools for each of the four testing levels.

## Detection Strategy

For each level, detection follows a priority-ordered list of indicators. The skill checks for:

1. **Config files** in the project root or common locations.
2. **Dependencies** in `package.json` (both `dependencies` and `devDependencies`).
3. **Import patterns** in existing test files (fallback heuristic).

If no tool is detected for a required level, the skill suggests installation and asks the user before proceeding.

---

## Level 1 — Unit Testing

### Vitest (preferred)

**Detection order:**

1. Config file exists:
   - `vitest.config.ts`
   - `vitest.config.js`
   - `vitest.config.mts`
   - `vitest.config.mjs`
   - `vite.config.ts` with `test` property (inline Vitest config)
2. Dependency in `package.json`:
   - `vitest` in `devDependencies`
3. Script in `package.json`:
   - `scripts.test` contains `vitest`

**Validation:** Run `pnpm vitest --version` to confirm the installation is functional.

### Jest (fallback)

**Detection order:**

1. Config file exists:
   - `jest.config.ts`
   - `jest.config.js`
   - `jest.config.cjs`
   - `jest.config.mjs`
   - `jest.config.json`
2. Dependency in `package.json`:
   - `jest` in `devDependencies`
3. Key in `package.json`:
   - `jest` configuration block at root level
4. Script in `package.json`:
   - `scripts.test` contains `jest`

**Validation:** Run `pnpm jest --version` to confirm.

### Mocha (legacy fallback)

**Detection order:**

1. Config file exists:
   - `.mocharc.yml`
   - `.mocharc.yaml`
   - `.mocharc.json`
   - `.mocharc.js`
   - `.mocharc.cjs`
2. Dependency in `package.json`:
   - `mocha` in `devDependencies`

**Note:** Mocha is supported but not recommended for UI testing. If detected, suggest migration to Vitest.

### Testing Library detection

Regardless of the test runner, check for the appropriate Testing Library package:

| Framework | Package | Detection |
|-----------|---------|-----------|
| React | `@testing-library/react` | `package.json` devDependencies |
| Vue | `@testing-library/vue` | `package.json` devDependencies |
| Angular | `@testing-library/angular` | `package.json` devDependencies |
| Svelte | `@testing-library/svelte` | `package.json` devDependencies |

Also check for companion packages:

- `@testing-library/jest-dom` — custom matchers (recommended for all)
- `@testing-library/user-event` — realistic user interaction simulation

### Install commands (when nothing detected)

**Vitest + React Testing Library (recommended default):**

```bash
pnpm add -D vitest @vitest/ui @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

**Vitest + Vue Testing Library:**

```bash
pnpm add -D vitest @vitest/ui @testing-library/vue @testing-library/jest-dom @testing-library/user-event jsdom
```

**Jest + React Testing Library:**

```bash
pnpm add -D jest @types/jest ts-jest @testing-library/react @testing-library/jest-dom @testing-library/user-event jest-environment-jsdom
```

**Starter Vitest config (`vitest.config.ts`):**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/**/*.d.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

---

## Level 2 — Component Testing (Playwright CT)

### Detection

**Framework-specific packages:**

| Framework | Package |
|-----------|---------|
| React | `@playwright/experimental-ct-react` |
| Vue | `@playwright/experimental-ct-vue` |
| Svelte | `@playwright/experimental-ct-svelte` |

**Config file:**

- `playwright-ct.config.ts`
- `playwright-ct.config.js`

**Detection steps:**

1. Read `package.json` for any `@playwright/experimental-ct-*` package.
2. Check for `playwright-ct.config.ts` or `playwright-ct.config.js` in project root.
3. If found, validate by running `pnpm playwright test --config=playwright-ct.config.ts --list`.

### Install commands

**React:**

```bash
pnpm add -D @playwright/experimental-ct-react
pnpm exec playwright install
```

**Vue:**

```bash
pnpm add -D @playwright/experimental-ct-vue
pnpm exec playwright install
```

**Svelte:**

```bash
pnpm add -D @playwright/experimental-ct-svelte
pnpm exec playwright install
```

After installation, generate a starter config. See [`references/playwright-components.md`](../ui-visual-testing/references/playwright-components.md) in the `ui-visual-testing` skill for the config template.

---

## Level 3 — E2E Testing (Playwright)

### Detection

**Detection order:**

1. Dependency in `package.json`:
   - `@playwright/test` in `devDependencies`
2. Config file exists:
   - `playwright.config.ts`
   - `playwright.config.js`
3. Script in `package.json`:
   - Any script containing `playwright`
4. Test directory exists:
   - `e2e/`
   - `tests/`
   - `src/__tests__/e2e/`

**Validation:**

1. Run `pnpm playwright --version` to confirm CLI is available.
2. Run `pnpm playwright install --dry-run` to check if browsers are installed.

### Browser installation check

Playwright requires browser binaries. After detecting the package, verify browsers are installed:

```bash
pnpm playwright install --dry-run 2>&1
```

If browsers are missing, suggest:

```bash
pnpm exec playwright install chromium
```

(Install only Chromium by default for speed; full suite for CI.)

### Install commands

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

**Starter config (`playwright.config.ts`):**

```typescript
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './src/__tests__/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
  },
})
```

---

## Level 4 — Visual Testing

### Detection

Visual testing always uses **Playwright + pixelmatch**. There is no alternative tool chain to detect.

**Required packages:**

| Package | Purpose |
|---------|---------|
| `@playwright/test` | Browser automation and screenshot capture |
| `pixelmatch` | Pixel-level image comparison |
| `pngjs` | PNG image parsing for pixelmatch |

**Detection steps:**

1. Check `@playwright/test` is installed (same as Level 3 detection).
2. Check `pixelmatch` in `devDependencies`.
3. Check `pngjs` in `devDependencies`.
4. Check for `ui-visual-testing.json` config file (component-level or project root).

### Install commands

If Playwright is already installed (from Level 3), only add the comparison packages:

```bash
pnpm add -D pixelmatch pngjs @types/pngjs
```

If Playwright is also missing:

```bash
pnpm add -D @playwright/test pixelmatch pngjs @types/pngjs
pnpm exec playwright install chromium
```

### Baseline directory detection

Check for existing baseline screenshots in these locations:

- `__screenshots__/` (project root)
- `src/__tests__/visual/baselines/`
- `.visual-baselines/`
- Any path specified in `ui-visual-testing.json`

---

## Framework-Specific Variants

### React / Next.js

- **Unit:** Vitest preferred (fast, native ESM support). Jest works but requires `ts-jest` or `@swc/jest` for TypeScript.
- **Component:** `@playwright/experimental-ct-react`. For Next.js, ensure `next.config.js` settings are compatible with CT bundling.
- **E2E:** Standard Playwright config. Use `webServer` option to start the Next.js dev server.
- **Visual:** No special considerations beyond hydration waiting (see `renderer-adapters.md`).

**Additional Next.js packages:**

- `@testing-library/react` requires `react-dom` (typically already installed)
- For RSC testing, use Vitest with `server` environment for server components and `jsdom` for client components

### Vue / Nuxt

- **Unit:** Vitest is the official recommendation for Vue 3. Use `@vue/test-utils` alongside `@testing-library/vue`.
- **Component:** `@playwright/experimental-ct-vue`. Supports Vue 3 SFCs with `<script setup>`.
- **E2E:** Standard Playwright. For Nuxt, use `webServer` to start the Nuxt dev server (`nuxi dev`).
- **Visual:** Handle Vue transitions by disabling animations or waiting for `transitionend` events.

**Additional Vue packages:**

```bash
pnpm add -D @vue/test-utils @testing-library/vue
```

### Angular

- **Unit:** Angular CLI ships with Karma/Jasmine by default. For modern setups, detect `jest` or `vitest` (via `@analogjs/vite-plugin-angular`). Suggest migration to Jest/Vitest if still on Karma.
- **Component:** `@playwright/experimental-ct-react` is not available for Angular. Use Playwright full-page testing with isolated routes instead.
- **E2E:** Playwright is the recommended replacement for Protractor. Check for `@angular-devkit/architect` Playwright builder.
- **Visual:** Zone.js timing requires explicit `waitForAngular()` or `page.waitForLoadState('networkidle')`.

**Detection hint:** Look for `angular.json` as the framework indicator.

### Svelte / SvelteKit

- **Unit:** Vitest with `@testing-library/svelte`. Svelte 5 runes may require specific Vitest plugin configuration.
- **Component:** `@playwright/experimental-ct-svelte`. Limited community adoption; full-page testing may be more practical.
- **E2E:** Standard Playwright. For SvelteKit, use `webServer` with `vite dev` or `vite preview`.
- **Visual:** Use `tick()` from `svelte` to ensure DOM updates are flushed before capturing screenshots.

**Detection hint:** Look for `svelte.config.js` or `svelte.config.ts` as the framework indicator.

---

## Detection Algorithm Summary

```
for each activeLevel:
  tools = DETECTION_ORDER[level]
  detected = null

  for each tool in tools:
    if configFileExists(tool) OR dependencyInstalled(tool):
      if validate(tool):
        detected = tool
        break

  if detected:
    log("Level {level}: using {detected.name} v{detected.version}")
  else:
    suggestion = INSTALL_SUGGESTIONS[level][framework]
    response = askUser("No {level} tool found. Install {suggestion}? [Y/n/skip]")

    if response == 'Y':
      run(suggestion.installCommand)
      detected = suggestion.tool
    elif response == 'skip':
      deactivateLevel(level)
    else:
      abort(exitCode: 2)
```
