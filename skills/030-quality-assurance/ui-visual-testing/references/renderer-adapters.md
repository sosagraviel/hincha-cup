# Renderer Adapters Reference

This document covers framework-specific considerations for capturing deterministic screenshots with Playwright. Each framework has unique timing, hydration, and rendering characteristics that must be accounted for to produce consistent, comparable screenshots.

## Common Concerns

These issues apply across all frameworks and should always be addressed before framework-specific handling.

### Web fonts

Web fonts load asynchronously and can cause text layout shifts. If a screenshot is captured before fonts load, the fallback font will produce a different layout.

**Mitigation:**

```javascript
// Wait for all fonts to load before capturing
await page.evaluate(() => document.fonts.ready);
```

For fonts loaded via `@font-face` with `font-display: swap`, also wait for the swap to complete:

```javascript
await page.evaluate(async () => {
  await document.fonts.ready;
  // Additional wait for swap rendering
  await new Promise(resolve => requestAnimationFrame(resolve));
});
```

### Image lazy loading

Images with `loading="lazy"` or intersection-observer-based loading may not load until scrolled into view.

**Mitigation:**

```javascript
// Scroll to bottom and back to trigger all lazy images
await page.evaluate(async () => {
  await new Promise(resolve => {
    let totalHeight = 0;
    const distance = 300;
    const timer = setInterval(() => {
      window.scrollBy(0, distance);
      totalHeight += distance;
      if (totalHeight >= document.body.scrollHeight) {
        clearInterval(timer);
        window.scrollTo(0, 0);
        resolve(undefined);
      }
    }, 50);
  });
});

// Wait for all images to load
await page.evaluate(() =>
  Promise.all(
    Array.from(document.images)
      .filter(img => !img.complete)
      .map(img => new Promise(resolve => {
        img.onload = resolve;
        img.onerror = resolve;
      }))
  )
);
```

### CSS animations and transitions

Animations cause non-deterministic screenshots depending on capture timing.

**Mitigation (inject globally before capture):**

```javascript
await page.addStyleTag({
  content: `
    *, *::before, *::after {
      animation-duration: 0s !important;
      animation-delay: 0s !important;
      transition-duration: 0s !important;
      transition-delay: 0s !important;
      scroll-behavior: auto !important;
    }
  `
});
```

### Cursor and selection

The blinking cursor in input fields and text selections cause flicker in screenshots.

**Mitigation:**

```javascript
await page.addStyleTag({
  content: `
    * { caret-color: transparent !important; }
    ::selection { background: transparent !important; }
  `
});
```

### Dynamic content

Timestamps, relative dates ("3 minutes ago"), user avatars, and other dynamic content produce false-positive diffs.

**Mitigation options:**

1. **Mask regions** in the comparison step (preferred — preserves visual fidelity of capture):
   ```json
   { "maskRegions": [{ "selector": "[data-testid='timestamp']" }] }
   ```
2. **Mock the clock** for time-dependent content:
   ```javascript
   await page.clock.setFixedTime(new Date('2026-01-15T10:00:00Z'));
   ```
3. **Use data-testid markers** to identify dynamic regions automatically.

---

## React

### Hydration wait

React Server Components and client-side hydration mean the initial HTML may differ from the final interactive state. Screenshots must wait for hydration to complete.

**Detection:** Check if the page uses React by looking for `__NEXT_DATA__` or `<div id="root">`.

**Mitigation:**

```javascript
// Wait for React hydration to complete
await page.waitForFunction(() => {
  // Next.js specific: check for hydration marker
  const html = document.documentElement;
  return !html.classList.contains('nprogress-busy') &&
         document.readyState === 'complete';
});

// Wait for any pending state updates to flush
await page.waitForTimeout(100);
```

### Suspense boundaries

React Suspense shows fallback content while async components load. Screenshots may capture the fallback instead of the resolved content.

**Mitigation:**

```javascript
// Wait for all Suspense boundaries to resolve
// Look for the absence of fallback indicators
await page.waitForFunction(() => {
  // No loading skeletons visible
  const skeletons = document.querySelectorAll('[data-testid="skeleton"], .skeleton, [aria-busy="true"]');
  return skeletons.length === 0;
});
```

### Lazy loading (`React.lazy`)

Dynamically imported components may not be loaded on initial render.

**Mitigation:**

```javascript
// Wait for dynamic imports to resolve
await page.waitForLoadState('networkidle');

// Additionally wait for any lazy-loaded components
await page.waitForFunction(() => {
  const suspenseFallbacks = document.querySelectorAll('[data-suspense-fallback]');
  return suspenseFallbacks.length === 0;
});
```

### React 19 concurrent features

React 19 with concurrent rendering may batch updates and defer rendering. Use `flushSync` awareness:

```javascript
// Wait for concurrent renders to settle
await page.waitForTimeout(200);
await page.waitForFunction(() => {
  return document.readyState === 'complete' &&
         !document.querySelector('[aria-busy="true"]');
});
```

---

## Next.js

### SSR vs CSR considerations

Next.js pages can be:
- **SSR (Server-Side Rendered):** HTML is complete on first load, but client-side JS still hydrates.
- **SSG (Static Site Generated):** Similar to SSR but pre-built.
- **CSR (Client-Side Rendered):** Initial HTML is minimal, content renders client-side.

**Detection:**

```javascript
const renderingMode = await page.evaluate(() => {
  if (window.__NEXT_DATA__?.props?.pageProps) return 'ssr';
  if (document.querySelector('#__next')?.children.length === 0) return 'csr';
  return 'ssg';
});
```

**SSR/SSG mitigation:**

```javascript
// Wait for hydration
await page.waitForFunction(() => {
  return window.__NEXT_DATA__ !== undefined &&
         document.readyState === 'complete';
});
```

**CSR mitigation:**

```javascript
// Wait for content to render
await page.waitForSelector('#__next > *');
await page.waitForLoadState('networkidle');
```

### App Router considerations

Next.js App Router (v13+) with React Server Components has additional timing concerns:

- **Streaming SSR:** Content may arrive in chunks. Wait for the full page:
  ```javascript
  await page.waitForFunction(() => {
    // Check that streaming is complete
    return !document.querySelector('template[data-next-stream]');
  });
  ```

- **Parallel routes:** Multiple route segments load independently:
  ```javascript
  // Wait for all route segments to resolve
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
  ```

- **Loading UI:** `loading.tsx` files show loading states during navigation:
  ```javascript
  // Wait for loading states to clear
  await page.waitForFunction(() => {
    const loadingElements = document.querySelectorAll('[data-next-loading]');
    return loadingElements.length === 0;
  });
  ```

### Route prefetching

Next.js prefetches linked routes on hover/viewport intersection. This network activity can affect `networkidle` timing.

**Mitigation:**

```javascript
// Use domcontentloaded + explicit selector instead of networkidle
await page.waitForLoadState('domcontentloaded');
await page.waitForSelector('[data-testid="page-content"]');
```

---

## Vue

### Transition handling

Vue's `<Transition>` and `<TransitionGroup>` components animate elements on enter/leave. These cause timing issues with screenshots.

**Mitigation:**

```javascript
// Disable Vue transitions globally
await page.addStyleTag({
  content: `
    .v-enter-active, .v-leave-active,
    .v-enter-from, .v-leave-to,
    [class*="transition-"], [class*="fade-"],
    [class*="slide-"], [class*="scale-"] {
      transition-duration: 0s !important;
      animation-duration: 0s !important;
    }
  `
});
```

For programmatic transitions using `Transition` hooks (`onEnter`, `onLeave`), the CSS approach may not be sufficient. Use:

```javascript
// Wait for Vue transition events to complete
await page.waitForFunction(() => {
  const transitioningElements = document.querySelectorAll(
    '.v-enter-active, .v-leave-active'
  );
  return transitioningElements.length === 0;
});
```

### Async components

Vue async components (via `defineAsyncComponent`) load on demand, similar to React.lazy.

**Mitigation:**

```javascript
// Wait for all async components to resolve
await page.waitForLoadState('networkidle');
await page.waitForFunction(() => {
  // No Vue async component placeholders
  const placeholders = document.querySelectorAll('[data-v-async-placeholder]');
  return placeholders.length === 0;
});
```

### Vue reactivity timing

Vue's reactivity system batches DOM updates via `nextTick`. After triggering an interaction, wait for the DOM to settle:

```javascript
await page.click('[data-testid="toggle"]');

// Wait for Vue's nextTick to flush DOM updates
await page.waitForFunction(() => {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve(true));
    });
  });
});
```

---

## Angular

### Zone.js timing

Angular uses Zone.js to track asynchronous operations. The framework considers itself "stable" when all pending microtasks and macrotasks are complete.

**Detection:** Check for Angular by looking for `ng-version` attribute on the root element.

**Mitigation:**

```javascript
// Wait for Angular zone stability
await page.waitForFunction(() => {
  const rootElement = document.querySelector('[ng-version]');
  if (!rootElement) return true; // Not an Angular app

  // Access Angular's testability API
  const testability = (window as any).getAllAngularTestabilities?.();
  if (!testability || testability.length === 0) return true;

  return testability.every((t: any) => t.isStable());
});
```

### Change detection

Angular's change detection runs on Zone.js events. After triggering interactions, change detection must complete before capturing:

```javascript
await page.click('[data-testid="button"]');

// Wait for Angular change detection to complete
await page.waitForFunction(() => {
  const testabilities = (window as any).getAllAngularTestabilities?.();
  return testabilities?.every((t: any) => t.isStable()) ?? true;
});
```

### OnPush change detection

Components using `ChangeDetectionStrategy.OnPush` may not update the DOM immediately after data changes. They require explicit `markForCheck()` or async pipe emissions.

**Mitigation:** After data changes, wait longer and check for the expected DOM state:

```javascript
await page.waitForSelector('[data-testid="updated-value"]', { timeout: 5000 });
```

### Angular Material / CDK

Angular Material components (dialogs, overlays, tooltips) use the CDK overlay system which renders content in a separate overlay container.

**Mitigation:**

```javascript
// Wait for CDK overlay animations to complete
await page.waitForFunction(() => {
  const overlays = document.querySelectorAll('.cdk-overlay-pane');
  const animating = Array.from(overlays).some(el =>
    el.classList.contains('ng-animating')
  );
  return !animating;
});
```

---

## Svelte

### tick() timing

Svelte batches DOM updates and applies them asynchronously via `tick()`. After state changes, the DOM may not be updated immediately.

**Detection:** Check for Svelte by looking for `__svelte_meta` or SvelteKit-specific markers.

**Mitigation:**

```javascript
// Wait for Svelte to flush pending DOM updates
await page.waitForFunction(() => {
  return new Promise(resolve => {
    // Double requestAnimationFrame ensures Svelte's tick() has completed
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve(true));
    });
  });
});
```

### SvelteKit considerations

SvelteKit has its own routing and loading system:

- **Load functions:** Data fetching happens in `+page.ts` / `+page.server.ts` load functions. Wait for data:
  ```javascript
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('[data-sveltekit-hydrated]');
  ```

- **Form actions:** After form submissions, SvelteKit may re-run load functions:
  ```javascript
  await page.waitForResponse(resp =>
    resp.url().includes('__data.json')
  );
  ```

### Svelte transitions

Svelte has built-in transitions (`fade`, `fly`, `slide`, `scale`, `draw`, `crossfade`).

**Mitigation:**

```javascript
// Disable Svelte transitions via CSS
await page.addStyleTag({
  content: `
    * {
      animation-duration: 0s !important;
      transition-duration: 0s !important;
    }
  `
});
```

For `in:` and `out:` directives that use JavaScript-based transitions:

```javascript
// Wait for all Svelte transitions to complete
await page.waitForFunction(() => {
  const introElements = document.querySelectorAll('[style*="animation"]');
  return introElements.length === 0;
});
```

### Svelte 5 runes

Svelte 5 introduces runes (`$state`, `$derived`, `$effect`) which change the reactivity model. Effects may run asynchronously:

```javascript
// After interaction, wait for effects to settle
await page.waitForTimeout(100);
await page.waitForFunction(() => document.readyState === 'complete');
```

---

## Universal Capture Sequence

Combining all the above, the recommended capture sequence for any framework is:

```javascript
async function captureScreenshot(page, route, viewport, framework) {
  // 1. Set viewport
  await page.setViewportSize(viewport);

  // 2. Navigate
  await page.goto(route, { waitUntil: 'domcontentloaded' });

  // 3. Wait for network to settle
  await page.waitForLoadState('networkidle');

  // 4. Wait for fonts
  await page.evaluate(() => document.fonts.ready);

  // 5. Framework-specific wait
  await frameworkWait(page, framework);

  // 6. Scroll to trigger lazy content
  await triggerLazyContent(page);

  // 7. Wait for images
  await waitForImages(page);

  // 8. Disable animations
  await disableAnimations(page);

  // 9. Hide cursor and selections
  await hideCursorAndSelections(page);

  // 10. Final settle
  await page.waitForTimeout(200);

  // 11. Capture
  return await page.screenshot({ fullPage: true });
}
```

The `frameworkWait` function dispatches to the appropriate framework-specific logic based on detection of framework markers in the DOM.
