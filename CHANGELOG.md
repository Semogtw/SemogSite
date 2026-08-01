# Changelog

All notable changes to Semogtw Platform are recorded here. Dates use `America/Bahia` for presentation; commits remain UTC in Git.

## Unreleased — Foundation and operational writes

### Added

- pnpm TypeScript monorepo with strict compiler settings;
- guardrails against upstream personal/PDI content and domain boundary violations;
- scanner for private fields and token patterns in public output surfaces;
- portable domain entities, repository ports and stage invariants;
- Overview, Today, Projects, typed project hub, agent-context and Roadmap services;
- explicit public/private Zod contracts and allowlisted public project serializer;
- SQLite-compatible canonical schema, Drizzle mappings, migrations and demo-only seed;
- SQLite read models for Overview, Today, project portfolio/hub and Roadmap;
- revocable local authentication, password hashing, token digest storage, CSRF and login throttling;
- Node/SQLite auth composition isolated in `.server.ts` modules;
- visible logout with session revocation and CSRF rejection;
- password-hash rotation revoking active sessions transactionally;
- Hono API partition with correlation IDs, sanitized errors, private authorization and `no-store` responses;
- Semogtw design tokens, accessible primitives and responsive public/DevOS navigation;
- functional accessible public mobile menu;
- public home, About, Projects, Journey, Lab, Notes, Stack and Contact route structures;
- protected DevOS login, Overview, Today, Projects, project hub, Roadmap, Operations, Insights, Capture, Search, Content, Settings, Audit and More;
- live private rendering from the canonical SQLite seed without claiming migration or GitHub sync;
- confirmed attention capture with CSRF, explicit reason and transactional audit;
- audited attention resolution/dismissal with optimistic concurrency protection;
- development-session handoff capture with normalized commit SHAs and explicit test status;
- manual evidence attachment with HTTPS-only links, preserved observed status and transactional audit;
- guarded stage completion that reuses domain invariants, requires valid evidence and sets a manual lock;
- responsive capture, evidence and stage-completion controls in the private DevOS interface;
- verified local SQLite backup library and CLIs with no-overwrite, integrity, foreign-key and migration checks;
- owner-only paginated audit review with exact filters, correlation IDs and malformed-JSON tolerance;
- `robots.txt` excluding private route prefixes;
- architecture, data model, security, public-site, migration, deployment, testing and design documentation;
- executable operational-writes plan covering evidence, backup and audit closeout.

### Fixed during review

- login rate-limiter result incorrectly treated as a boolean;
- cookie environment argument used with the wrong type;
- login success redirect being caught as an error;
- potentially unsupported `deleteCookie` dependency replaced with documented cookie expiration;
- CSRF cookie path expanded so TanStack server-function RPC requests can receive it;
- incomplete public projects now omitted instead of causing serializer failures;
- UI tests now run with jsdom and Testing Library matchers;
- API integration tests outside `src` now run and typecheck;
- semantic priority ordering replaces alphabetical enum ordering;
- project hub queries filter by project in SQL;
- Today links use project slugs rather than internal IDs;
- native `better-sqlite3` is externalized from Vite SSR bundling;
- empty example secrets no longer encourage predictable local configuration;
- captured attention now maps domain `source` to SQLite `data_source` explicitly;
- critical-test captures now map to canonical `local_test` storage values;
- external dependencies and critical tests now enter the external-environment queue instead of the owner queue;
- audit filters are applied before ordering/pagination through Drizzle's dynamic query mode;
- backup tests now reopen the snapshot and verify restored data rather than checking file existence alone.

### Verified in current environment

- stage validation equivalent suite: 4 passing tests;
- local auth/session equivalent suite: 2 passing tests;
- public confidentiality scanner behavior;
- upstream and domain-boundary guardrail behavior;
- Node.js 22 availability.

### Specified by committed tests but not yet executed here

- attention capture validation, classification, mapping and transaction rollback;
- attention lifecycle validation, optimistic conflicts and audit atomicity;
- session handoff normalization, explicit test status and transaction rollback;
- manual evidence allowlists, safe URL validation and audit atomicity;
- guarded stage completion invariants, stale-write rejection and rollback;
- verified SQLite backup creation, no-overwrite policy and restore content;
- paginated audit filters and malformed historical JSON handling;
- auth runtime composition and 14-day expiry;
- safe login destinations and CSRF-aware logout policy;
- password rotation session revocation;
- SQLite repository priority ordering;
- SQLite Overview, Today, project hub and Roadmap reads;
- API incomplete-public-record filtering and private cache headers;
- mobile menu interactions and UI accessibility matchers.

### Not yet verified

- dependency installation and generated `pnpm-lock.yaml`;
- full TypeScript workspace check;
- Vitest workspace;
- TanStack Start production build;
- authenticated browser checks for operational writes and audit review;
- backup CLI execution against a real file-backed database;
- browser E2E and responsive visual review;
- production host, deployment and rollback.

### Constraints

- connected Figma account reported a view-only starter seat, so editable frames were not falsely marked complete;
- the environment npm registry previously returned 404 and the current runtime cannot resolve `registry.npmjs.org`, documented in `TESTING.md`;
- no Notion migration, GitHub sync, MCP or public deployment has been performed.
