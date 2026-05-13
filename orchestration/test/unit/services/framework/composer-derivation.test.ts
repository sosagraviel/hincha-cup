import { describe, it, expect } from 'vitest';
import {
  deriveRepositoryShapeSummary,
  deriveExternalServices,
  deriveQualityTools,
  deriveEnforcementSummary,
  deriveTestingRunners,
  deriveTestingFrameworksByService,
  deriveTestingProjectSummary,
  deriveAuthFlow,
  deriveEventPipeline,
  extractDepsFromManifest,
} from '../../../../src/services/framework/composer-derivation/index.js';
import type { DeriveInput } from '../../../../src/services/framework/composer-derivation/types.js';
import type { ProjectInspection } from '../../../../src/schemas/project-inspection.schema.js';

function makeInspection(overrides: Partial<ProjectInspection>): ProjectInspection {
  return {
    generated_at: '2026-05-12T00:00:00.000Z',
    schema_version: '1',
    repository_type: 'single-service',
    manifests: [],
    infrastructure: [],
    port_candidates: {},
    ...overrides,
  } as ProjectInspection;
}

describe('extractDepsFromManifest', () => {
  it('package.json — pulls dependencies + devDependencies', () => {
    const deps = extractDepsFromManifest({
      kind: 'package.json',
      path: 'package.json',
      raw: {
        dependencies: { '@nestjs/core': '^11.0', stripe: '^14.0' },
        devDependencies: { vitest: '^4.0', eslint: '^9.0' },
      },
    });
    expect(deps).toEqual(['@nestjs/core', 'eslint', 'stripe', 'vitest']);
  });

  it('pyproject.toml — pulls deps from project + tool.poetry tables', () => {
    const raw = `
[project]
name = "myproj"
dependencies = ["fastapi>=0.100", "sqlalchemy==2.0"]

[tool.poetry.dependencies]
python = "^3.11"
celery = "^5.3"
sentry-sdk = "^1.0"
    `;
    const deps = extractDepsFromManifest({ kind: 'pyproject.toml', path: 'pyproject.toml', raw });
    expect(deps).toContain('celery');
    expect(deps).toContain('sentry-sdk');
    expect(deps).toContain('fastapi');
    expect(deps).not.toContain('python');
  });

  it('Gemfile — pulls gem entries', () => {
    const raw = `
source 'https://rubygems.org'
gem 'rails', '7.0'
gem "devise"
gem 'sidekiq', '~> 7.0'
    `;
    const deps = extractDepsFromManifest({ kind: 'Gemfile', path: 'Gemfile', raw });
    expect(deps).toEqual(['devise', 'rails', 'sidekiq']);
  });

  it('go.mod — pulls module requirements', () => {
    const raw = `
module github.com/me/proj
go 1.22

require (
    github.com/gin-gonic/gin v1.9.0
    github.com/golang-jwt/jwt v3.2.2
)
    `;
    const deps = extractDepsFromManifest({ kind: 'go.mod', path: 'go.mod', raw });
    expect(deps).toContain('github.com/gin-gonic/gin');
    expect(deps).toContain('github.com/golang-jwt/jwt');
  });

  it('Cargo.toml — pulls [dependencies] + [dev-dependencies]', () => {
    const raw = `
[package]
name = "myproj"
version = "0.1.0"

[dependencies]
tokio = "1.0"
sqlx = "0.7"

[dev-dependencies]
mockall = "0.11"
    `;
    const deps = extractDepsFromManifest({ kind: 'Cargo.toml', path: 'Cargo.toml', raw });
    expect(deps).toEqual(['mockall', 'sqlx', 'tokio']);
  });

  it('build.gradle — pulls implementation + api coordinates', () => {
    const raw = `
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web'
    implementation "org.springframework.kafka:spring-kafka"
    testImplementation 'org.junit.jupiter:junit-jupiter'
}
    `;
    const deps = extractDepsFromManifest({ kind: 'build.gradle', path: 'build.gradle', raw });
    expect(deps).toContain('spring-boot-starter-web');
    expect(deps).toContain('spring-kafka');
    expect(deps).toContain('junit-jupiter');
  });

  it('*.csproj — pulls PackageReference entries', () => {
    const raw = `<Project>
  <ItemGroup>
    <PackageReference Include="Stripe.net" Version="42.0" />
    <PackageReference Include="MassTransit" Version="8.0" />
  </ItemGroup>
</Project>`;
    const deps = extractDepsFromManifest({ kind: 'app.csproj', path: 'app.csproj', raw });
    expect(deps).toEqual(['MassTransit', 'Stripe.net']);
  });

  it('returns [] for unknown manifest kinds', () => {
    const deps = extractDepsFromManifest({ kind: 'unknown.toml', path: 'unknown.toml', raw: '' });
    expect(deps).toEqual([]);
  });
});

describe('deriveExternalServices', () => {
  it('detects Stripe + Sentry from a JS package.json', () => {
    const input: DeriveInput = {
      inspection: makeInspection({
        manifests: [
          {
            kind: 'package.json',
            path: 'package.json',
            raw: {
              dependencies: {
                stripe: '^14',
                '@sentry/node': '^7',
                '@nestjs/core': '^11',
              },
            },
          },
        ],
      }),
    };
    const result = deriveExternalServices(input);
    const names = result.map((r) => r.name);
    expect(names).toContain('Stripe');
    expect(names).toContain('Sentry');
    expect(result.find((r) => r.name === 'Stripe')?.purpose).toBe('payments');
  });

  it('detects boto3 (AWS) from a Python project', () => {
    const input: DeriveInput = {
      inspection: makeInspection({
        manifests: [
          {
            kind: 'pyproject.toml',
            path: 'pyproject.toml',
            raw: `
[tool.poetry.dependencies]
python = "^3.11"
boto3 = "^1.30"
sentry-sdk = "^1.0"
            `,
          },
        ],
      }),
    };
    const result = deriveExternalServices(input);
    const names = result.map((r) => r.name);
    expect(names).toContain('AWS');
    expect(names).toContain('Sentry');
  });

  it('returns [] when no recognised SDKs are present', () => {
    const input: DeriveInput = {
      inspection: makeInspection({
        manifests: [
          {
            kind: 'package.json',
            path: 'package.json',
            raw: { dependencies: { 'no-such-package-anywhere': '^1' } },
          },
        ],
      }),
    };
    expect(deriveExternalServices(input)).toEqual([]);
  });
});

describe('deriveQualityTools', () => {
  it('detects ESLint + Prettier + TypeScript + Husky from a Node project', () => {
    const input: DeriveInput = {
      inspection: makeInspection({
        manifests: [
          {
            kind: 'package.json',
            path: 'package.json',
            raw: {
              devDependencies: {
                eslint: '^9',
                prettier: '^3',
                typescript: '^5',
                husky: '^9',
              },
            },
          },
        ],
      }),
    };
    const result = deriveQualityTools(input, '/nonexistent');
    expect(result.linter).toBe('eslint');
    expect(result.formatter).toBe('prettier');
    expect(result.type_checker).toBe('typescript');
    expect(result.pre_commit).toBe('husky');
  });

  it('returns {} when no quality tools are detected', () => {
    const input: DeriveInput = {
      inspection: makeInspection({
        manifests: [
          {
            kind: 'package.json',
            path: 'package.json',
            raw: { dependencies: { '@nestjs/core': '^11' } },
          },
        ],
      }),
    };
    const result = deriveQualityTools(input, '/nonexistent');
    expect(result).toEqual({});
  });
});

describe('deriveAuthFlow', () => {
  it('returns Keycloak/oauth2-pkce when @keycloak/* is present', () => {
    const input: DeriveInput = {
      inspection: makeInspection({
        manifests: [
          {
            kind: 'package.json',
            path: 'package.json',
            raw: {
              dependencies: {
                '@keycloak/keycloak-admin-client': '^26',
                '@nestjs/jwt': '^11',
              },
            },
          },
        ],
      }),
    };
    const result = deriveAuthFlow(input);
    expect(result?.strategy).toBe('oauth2-pkce');
    expect(result?.libraries).toContain('Keycloak Admin Client');
    expect(result?.summary).toMatch(/OAuth2 authorization-code flow with PKCE/);
  });

  it('returns jwt-bearer when only @nestjs/jwt is present', () => {
    const input: DeriveInput = {
      inspection: makeInspection({
        manifests: [
          {
            kind: 'package.json',
            path: 'package.json',
            raw: { dependencies: { '@nestjs/jwt': '^11' } },
          },
        ],
      }),
    };
    const result = deriveAuthFlow(input);
    expect(result?.strategy).toBe('jwt-bearer');
    expect(result?.libraries).toContain('@nestjs/jwt');
  });

  it('returns undefined when no auth library is present', () => {
    const input: DeriveInput = {
      inspection: makeInspection({
        manifests: [
          {
            kind: 'package.json',
            path: 'package.json',
            raw: { dependencies: { lodash: '^4' } },
          },
        ],
      }),
    };
    expect(deriveAuthFlow(input)).toBeUndefined();
  });
});

describe('deriveEventPipeline', () => {
  it('returns BullMQ/task-queue when bullmq is in package.json', () => {
    const input: DeriveInput = {
      inspection: makeInspection({
        manifests: [
          {
            kind: 'package.json',
            path: 'package.json',
            raw: { dependencies: { bullmq: '^5' } },
          },
        ],
      }),
    };
    const result = deriveEventPipeline(input);
    expect(result?.pattern).toBe('task-queue');
    expect(result?.technology).toBe('BullMQ');
  });

  it('returns Celery/task-queue from Python project', () => {
    const input: DeriveInput = {
      inspection: makeInspection({
        manifests: [
          {
            kind: 'pyproject.toml',
            path: 'pyproject.toml',
            raw: `
[tool.poetry.dependencies]
celery = "^5.3"
            `,
          },
        ],
      }),
    };
    const result = deriveEventPipeline(input);
    expect(result?.pattern).toBe('task-queue');
    expect(result?.technology).toBe('Celery');
  });

  it('returns undefined with no queue library', () => {
    const input: DeriveInput = {
      inspection: makeInspection({
        manifests: [
          {
            kind: 'package.json',
            path: 'package.json',
            raw: { dependencies: {} },
          },
        ],
      }),
    };
    expect(deriveEventPipeline(input)).toBeUndefined();
  });
});

describe('deriveTesting*', () => {
  it('detects Vitest + Playwright from a Node monorepo', () => {
    const input: DeriveInput = {
      inspection: makeInspection({
        manifests: [
          {
            kind: 'package.json',
            path: 'package.json',
            raw: {
              devDependencies: {
                vitest: '^4',
                '@playwright/test': '^1',
              },
            },
          },
        ],
      }),
    };
    const runners = deriveTestingRunners(input);
    expect(runners).toContain('vitest');
    expect(runners).toContain('@playwright/test');
    const summary = deriveTestingProjectSummary(input, runners);
    expect(summary).toMatch(/vitest/i);
    expect(summary).toMatch(/playwright/i);
  });

  it('returns "No automated test runner detected" when none', () => {
    expect(deriveTestingProjectSummary({ inspection: makeInspection({}) }, [])).toBe(
      'No automated test runner detected.',
    );
  });

  it('produces by-service frameworks when manifests are per-service', () => {
    const input: DeriveInput = {
      inspection: makeInspection({
        repository_type: 'monorepo',
        manifests: [
          {
            kind: 'package.json',
            path: 'services/backend/package.json',
            raw: { devDependencies: { vitest: '^4' } },
          },
          {
            kind: 'package.json',
            path: 'services/web/package.json',
            raw: { devDependencies: { jest: '^29' } },
          },
        ],
      }),
      services: [
        { id: 'backend', path: 'services/backend' },
        { id: 'web', path: 'services/web' },
      ],
    };
    const frameworks = deriveTestingFrameworksByService(input);
    expect(frameworks.backend?.unit).toBe('vitest');
    expect(frameworks.web?.unit).toBe('jest');
  });
});

describe('deriveRepositoryShapeSummary', () => {
  it('produces a sentence covering monorepo + languages + runtimes', () => {
    const input: DeriveInput = {
      inspection: makeInspection({
        repository_type: 'monorepo',
        monorepo: {
          workspace_tool: 'pnpm workspaces',
          workspace_paths: ['services/*', 'packages/*'],
        },
        runtime_versions: { node: '22.5.1' },
      }),
      services: [
        { id: 'backend', path: 'services/backend' },
        { id: 'web', path: 'services/web' },
      ],
      fileCounts: [
        { language: 'typescript', count: 314 },
        { language: 'css', count: 16 },
      ],
    };
    const out = deriveRepositoryShapeSummary(input);
    expect(out).toMatch(/pnpm workspaces monorepo with 2 services/);
    expect(out).toMatch(/typescript, css/);
    expect(out).toMatch(/node=22\.5\.1/);
  });

  it('handles single-service projects', () => {
    const input: DeriveInput = {
      inspection: makeInspection({
        repository_type: 'single-service',
        manifests: [{ kind: 'package.json', path: 'package.json', raw: {} }],
      }),
    };
    const out = deriveRepositoryShapeSummary(input);
    expect(out).toMatch(/Single-service repository/);
  });
});

describe('deriveEnforcementSummary', () => {
  it('renders a 1–2 sentence baseline from detected tools', () => {
    const input: DeriveInput = { inspection: makeInspection({}) };
    const summary = deriveEnforcementSummary(
      input,
      { linter: 'eslint', formatter: 'prettier', type_checker: 'typescript', pre_commit: 'husky' },
      'GitHub Actions',
    );
    expect(summary).toMatch(/eslint \+ prettier \+ typescript are configured/);
    expect(summary).toMatch(/husky runs/);
    expect(summary).toMatch(/GitHub Actions re-runs/);
  });

  it('says "No automated quality gates" when nothing detected', () => {
    expect(deriveEnforcementSummary({ inspection: makeInspection({}) }, {})).toBe(
      'No automated quality gates detected.',
    );
  });
});
