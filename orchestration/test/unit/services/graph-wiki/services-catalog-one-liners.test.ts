import { describe, expect, it } from 'vitest';
import { deriveStackAgnosticRole } from '../../../../src/services/graph-wiki/wiki-generator.service.js';

/**
 * Wave 2 Fix 3.4 — `<role>` derives from `service.type` +
 * `service.frameworks.main` via a stack-agnostic mapping. Plan §B.21
 * lists canonical examples across language families. The fixtures
 * here exercise every category so a regression on any one stack
 * (e.g. losing the Rails branch when reordering JS frameworks)
 * surfaces immediately.
 *
 * Stack-agnostic by construction: the test cases span 11 language
 * families. None of the assertions reference a single project's
 * service ids or paths.
 */

describe('deriveStackAgnosticRole — Wave 2 Fix 3.4', () => {
  describe.each([
    // JS/TS backends
    { framework: 'NestJS ^11.0.11', type: 'backend', expected: 'NestJS REST/WebSocket API' },
    { framework: 'Express 4.x', type: 'backend', expected: 'Express HTTP service' },
    { framework: 'Fastify 4.x', type: 'backend', expected: 'Fastify HTTP service' },
    // Python backends
    { framework: 'Django 5.0', type: 'backend', expected: 'Django REST API' },
    { framework: 'Flask 3.0', type: 'backend', expected: 'Flask HTTP service' },
    { framework: 'FastAPI 0.115', type: 'backend', expected: 'FastAPI HTTP service' },
    // Java / Kotlin
    { framework: 'Spring Boot 3.4', type: 'backend', expected: 'Spring Boot service' },
    { framework: 'Quarkus 3.6', type: 'backend', expected: 'Quarkus service' },
    { framework: 'Micronaut 4.2', type: 'backend', expected: 'Micronaut service' },
    { framework: 'Ktor 2.3', type: 'backend', expected: 'Ktor service' },
    // Ruby
    { framework: 'Rails 7.1', type: 'backend', expected: 'Rails API' },
    { framework: 'Sinatra 4.0', type: 'backend', expected: 'Sinatra HTTP service' },
    // PHP
    { framework: 'Laravel 11', type: 'backend', expected: 'Laravel HTTP service' },
    { framework: 'Symfony 7', type: 'backend', expected: 'Symfony HTTP service' },
    // Go
    { framework: 'Gin 1.10', type: 'backend', expected: 'Go HTTP service' },
    { framework: 'Echo 4.12', type: 'backend', expected: 'Go HTTP service' },
    { framework: 'Chi 5.1', type: 'backend', expected: 'Go HTTP service' },
    // Rust
    { framework: 'Axum 0.7', type: 'backend', expected: 'Axum HTTP service' },
    { framework: 'Rocket 0.5', type: 'backend', expected: 'Rocket HTTP service' },
    { framework: 'Actix-web 4.5', type: 'backend', expected: 'Actix HTTP service' },
    // .NET / Scala / Elixir
    { framework: 'ASP.NET Core 8', type: 'backend', expected: 'ASP.NET service' },
    { framework: 'Play 3.0', type: 'backend', expected: 'Play HTTP service' },
    { framework: 'Akka HTTP 10.5', type: 'backend', expected: 'Akka HTTP service' },
    { framework: 'Phoenix 1.7', type: 'backend', expected: 'Phoenix HTTP service' },
    // Frontends
    { framework: 'React 19.1', type: 'frontend', expected: 'React SPA' },
    { framework: 'Vue 3.4', type: 'frontend', expected: 'Vue SPA' },
    { framework: 'Angular 17', type: 'frontend', expected: 'Angular SPA' },
    { framework: 'SvelteKit 2.0', type: 'frontend', expected: 'Svelte SPA' },
    { framework: 'Next.js 15', type: 'frontend', expected: 'Next.js app' },
    { framework: 'Nuxt 3.10', type: 'frontend', expected: 'Nuxt app' },
    { framework: 'Astro 4.0', type: 'frontend', expected: 'Astro site' },
    // Workers
    { framework: 'BullMQ 5.0', type: 'worker', expected: 'Background worker' },
    { framework: 'Sidekiq 7.2', type: 'worker', expected: 'Sidekiq worker' },
    { framework: 'Celery 5.3', type: 'worker', expected: 'Celery worker' },
    { framework: 'Asynq 0.24', type: 'worker', expected: 'Asynq worker' },
    // Mobile / Desktop
    { framework: 'React Native 0.74', type: 'mobile', expected: 'React Native app' },
    { framework: 'Flutter 3.19', type: 'mobile', expected: 'Flutter app' },
    { framework: 'Electron 28', type: 'desktop', expected: 'Electron app' },
    { framework: 'Tauri 2.0', type: 'desktop', expected: 'Tauri app' },
  ])('$type + $framework → $expected', ({ framework, type, expected }) => {
    it('renders the canonical role one-liner', () => {
      expect(
        deriveStackAgnosticRole({
          type,
          frameworks: { main: framework },
        }),
      ).toBe(expected);
    });
  });

  describe('type-only fallbacks (no framework match)', () => {
    it.each([
      ['library', undefined, 'Internal library'],
      ['cli', undefined, 'CLI tool'],
      ['serverless', undefined, 'Serverless function bundle'],
      ['infrastructure', undefined, 'Infrastructure component'],
      ['worker', undefined, 'Background worker'],
      ['frontend', undefined, 'Frontend app'],
      ['backend', undefined, 'Backend service'],
    ])('type=%s framework=%s → %s', (type, framework, expected) => {
      const service: Record<string, unknown> = { type };
      if (framework) service.frameworks = { main: framework };
      expect(deriveStackAgnosticRole(service)).toBe(expected);
    });
  });

  describe('framework + fallback type prefix', () => {
    it('prefixes framework name onto the type fallback when no specific match exists', () => {
      // An unknown framework on a known type falls through to "framework
      // <type-fallback>". E.g. a custom in-house framework on a backend.
      expect(
        deriveStackAgnosticRole({ type: 'backend', frameworks: { main: 'CustomFrameX 1.0' } }),
      ).toBe('CustomFrameX backend service');
    });
  });

  describe('defensive cases', () => {
    it('returns undefined when service has no type', () => {
      expect(deriveStackAgnosticRole({})).toBeUndefined();
    });

    it('returns undefined for an unknown type with no framework', () => {
      expect(deriveStackAgnosticRole({ type: 'mystery-type' })).toBeUndefined();
    });

    it('handles missing frameworks object (defensive)', () => {
      expect(deriveStackAgnosticRole({ type: 'library' })).toBe('Internal library');
    });

    it('handles non-object frameworks value (defensive)', () => {
      expect(deriveStackAgnosticRole({ type: 'cli', frameworks: 'oops' as never })).toBe(
        'CLI tool',
      );
    });

    it('strips version constraints from the framework name in the prefix path', () => {
      // The prefix path uses the cleaned framework name (no version).
      expect(
        deriveStackAgnosticRole({ type: 'backend', frameworks: { main: 'MysteryFrame ^2.0' } }),
      ).toBe('MysteryFrame backend service');
    });
  });
});
