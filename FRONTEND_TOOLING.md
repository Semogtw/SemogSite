# Frontend Tooling

## Current stack

- TanStack Start, Router and Query;
- React and TypeScript strict mode;
- CSS variables and shared `@semogtw/ui` package;
- Lucide SVG icons selected through Supericons;
- Vitest and Testing Library;
- Playwright planned for E2E after the first successful build.

## Context7

Consult Context7 before implementing or correcting framework-specific APIs. Prefer official/current documentation for:

- TanStack Start server functions, route guards and hosting;
- Hono middleware and runtime adapters;
- Drizzle schema/query APIs;
- testing-library and Playwright behavior.

Document material version/API changes in `CHANGELOG.md`. Domain code must not change merely because a framework API changed.

## Figma

Figma is the design-review and handoff surface. It is not a source of domain rules or authorization. The connected account currently reports a view-only seat; required frames and the code source of truth are recorded in `docs/design/FIGMA_REFERENCE.md`.

## Supericons

Supericons was used to select a coherent Lucide outline family. Exact semantic mappings live in `docs/DESIGN_SYSTEM.md`. Runtime code imports the normal `lucide-react` package; the Supericons service is not a production dependency.

## Canva

Canva may produce editorial/social assets after brand and public content approval. It must not define application layout, component behavior, private data or business rules.

## Browser tooling

Playwright belongs near the repository and will cover deterministic flows. Chrome DevTools is reserved for network/performance investigation. Neither should receive personal browser cookies through an exposed remote MCP.

## Storybook and shadcn

Storybook may be added after the shared component package builds and has stable primitives. shadcn patterns may be adapted selectively, but generated dependencies and styling must be reviewed; no registry is treated as a runtime source of truth.

## Dependency policy

- add only dependencies used by an implemented feature;
- prefer Web Standards in shared packages;
- prevent framework imports in `packages/domain`;
- pin a lockfile after the first successful install;
- remove upstream/template dependencies that do not serve Semogtw;
- review package licenses before distribution.
