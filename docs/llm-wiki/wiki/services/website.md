---
document_type: service
summary: >-
  The website service is a static documentation site built with Docusaurus and
  deployed via GitHub Pages. It serves as the public-facing knowledge base for
  the...
last_updated: '2026-06-13T19:05:02.079Z'
tags:
  - service
  - typescript
  - frontend
  - docusaurus
service_id: website
---
# website

## Purpose

The website service is a static documentation site built with Docusaurus and deployed via GitHub Pages. It serves as the public-facing knowledge base for the qubika-agentic-framework, providing getting-started guides, architecture explanations, and framework configuration references to developers adopting the framework.

## Public API / Surface

The website has no runtime API surface—it is a pre-rendered static site. Consumer access points are:

- **Entry point**: `website/src/pages/index.tsx` — homepage
- **Page routes**: `website/src/pages/{page}.tsx` — statically generated page components
- **Feature components**: `website/src/components/{Feature}/index.tsx` — reusable UI building blocks
- **Styles**: `website/src/css/custom.css` (global), `website/src/components/{Component}/styles.module.css` (scoped)

Docusaurus automatically generates HTML routes from the `src/pages/` directory structure. Pages support both `.tsx` (React) and `.md` (Markdown) formats, with MDX support for embedding React components within Markdown content.

## Internal Architecture

The website follows a standard Docusaurus 3.10.0 structure:

- **Pages layer** (`src/pages/`): React components or Markdown files that define top-level routes
- **Components layer** (`src/components/`): Reusable React UI components (e.g., `HomepageFeatures`) with CSS modules for scoped styling
- **Styles layer** (`src/css/`): Global CSS (`custom.css`) for theme and layout overrides
- **Build output**: Static HTML+CSS+JS generated at build time by Docusaurus and deployed to GitHub Pages

No runtime server exists; Docusaurus pre-renders all pages during the build phase.

## Request Lifecycle

1. Developer triggers build (`pnpm --filter website build`)
2. Docusaurus processes `src/pages/` and MDX documents, transpiling React/TypeScript
3. Static HTML, CSS, and JavaScript bundles are generated to a `build/` directory
4. Artifacts are deployed to GitHub Pages (via CI workflow)
5. Browser requests fetch pre-rendered HTML; client-side React hydration provides interactivity

## Data Layer

(not determined by analysis)

## Configuration

(no environment variables consumed)

## Integrations

The website service has no runtime dependency on [[orchestration]] or other services. It is built and deployed independently. The documentation it contains *describes* the orchestration framework and monorepo structure, but requires no functional integration.

## Service-Specific Patterns

- **Docusaurus plugins**: Extend build process (e.g., custom markdown processors, asset pipelines)
- **React component composition**: Pages and components use TypeScript for type safety; styles use CSS modules to avoid global namespace pollution
- **MDX documents**: Markdown files can embed React components, enabling interactive documentation examples
- **Static site generation**: All content is pre-rendered at build time; no server-side rendering or dynamic APIs
