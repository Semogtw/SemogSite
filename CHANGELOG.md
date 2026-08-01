# Changelog

All notable changes to Semogtw Platform are recorded here. Dates use `America/Bahia` for presentation; commits remain UTC in Git.

## Unreleased — Foundation

### Added

- pnpm TypeScript monorepo with strict compiler settings;
- guardrails against upstream personal/PDI content and domain boundary violations;
- portable domain entities, repository ports and stage invariants;
- Overview, Today, Projects, agent-context and Roadmap services;
- explicit public/private Zod contracts and allowlisted public project serializer;
- SQLite-compatible canonical schema, Drizzle mappings, migrations and demo-only seed;
- revocable local authentication, password hashing, token digest storage, CSRF and login throttling;
- Hono API partition with correlation IDs, sanitized errors and private authorization middleware;
- Semogtw design tokens, accessible primitives and responsive public/DevOS navigation;
- public home, About, Projects, Journey, Lab, Notes, Stack and Contact route structures;
- protected DevOS login, Overview, Today, Projects, project hub and read-only Roadmap foundations;
- architecture, data model, security, public-site, migration, deployment, testing and design documentation.

### Verified in current environment

- stage validation equivalent suite: 4 passing tests;
- local auth/session equivalent suite: 2 passing tests;
- guardrail scanner behavior;
- Node.js 22 availability.

### Not yet verified

- dependency installation and generated `pnpm-lock.yaml`;
- full TypeScript workspace check;
- Vitest workspace;
- TanStack Start production build;
- Hono integration suite with installed dependencies;
- SQLite repository suite with `better-sqlite3`;
- browser E2E and responsive visual review;
- production host, deployment and rollback.

### Constraints

- connected Figma account reported a view-only starter seat, so editable frames were not falsely marked complete;
- the environment npm registry returned 404 for Vitest, documented in `TESTING.md`;
- no Notion migration, GitHub sync, MCP or public deployment has been performed.
