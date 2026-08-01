# Changelog

All notable changes to Semogtw Platform are recorded here. Dates use `America/Bahia` for presentation; commits remain UTC in Git.

## Unreleased — Foundation, operational writes, GitHub operations and MCP reads

### Added

- pnpm TypeScript monorepo with strict compiler settings and package boundaries;
- explicit public/private contracts and allowlisted public serializers;
- SQLite/Drizzle persistence, inspectable migrations and a demo-only seed;
- revocable local authentication, password hashing, token-digest sessions, CSRF and throttling;
- Hono public/private API partition with sanitized errors and `no-store` private responses;
- Semogtw design tokens, accessible primitives and responsive public/DevOS navigation;
- public editorial route structures and protected DevOS operational routes;
- audited attention capture, resolution and dismissal;
- audited development-session handoffs with explicit test status;
- manual evidence attachment with HTTPS-only links and preserved evidence status;
- guarded stage completion through canonical evidence invariants and optimistic concurrency;
- verified local SQLite backup/verification library and CLIs;
- owner-only paginated audit review with malformed historical JSON tolerance;
- deterministic, provider-neutral branch recommendation with alias, tie and stability-window rules;
- isolated `@semogtw/github` read-only REST adapter with versioned headers, ETags, bounded reads and typed rate-limit failures;
- immutable repository, branch and recommendation observations linked to `sync_runs`;
- partial-run semantics that preserve useful evidence while reporting provider or branch failures honestly;
- owner-only Operations dashboard showing token configuration state, runs, warnings, rate limits and recommendations;
- audited local acceptance of the latest branch recommendation without any GitHub write;
- private repository-target registration without SQL or browser-supplied tokens;
- audited pause/reactivation of repository observation targets while retaining historical evidence;
- migration `0004_github_sync_runs.sql`, extending the legacy `sync_runs` table without deleting its original fields;
- empty `SEMOGTW_GITHUB_TOKEN` declaration in `.env.example` for server-side configuration;
- provider-neutral `DevOSReadService` delegating to canonical Overview, Today, Project and Roadmap services;
- bounded project-slug and roadmap-filter validation before MCP/read-adapter access;
- `@semogtw/mcp` adapter using the stable MCP v1.x contract with four static resources and five read tools;
- read-only, non-destructive, idempotent and closed-world annotations for every MCP tool;
- MCP success responses with textual JSON plus `structuredContent`;
- stable sanitized MCP errors without thrown exception text;
- `apps/mcp` SQLite composition returning an `McpServer` without opening stdio or HTTP listeners;
- protocol specifications using the official client and `InMemoryTransport`;
- SQLite-to-MCP integration specification against the migrated demo database;
- dedicated MCP implementation plan and security/runbook boundaries for future remote transport.

### Fixed during review

- login rate-limiter result incorrectly treated as a boolean;
- cookie environment argument used with the wrong type;
- login success redirect being caught as an error;
- CSRF cookie path expanded so TanStack server-function RPC requests can receive it;
- incomplete public projects omitted rather than causing serializer failures;
- semantic priority ordering replacing alphabetical enum ordering;
- Today links using project slugs rather than internal IDs;
- native `better-sqlite3` externalized from Vite SSR bundling;
- attention capture mapping domain `source` to SQLite `data_source`;
- critical-test captures mapped to canonical `local_test` storage;
- external dependencies and critical tests entering the external-environment queue;
- audit filters applied before ordering/pagination through Drizzle dynamic queries;
- backup tests reopening snapshots and verifying restored data;
- operational GitHub services and adapters missing from package barrel exports;
- missing `@semogtw/github` web workspace dependency;
- the Operations route still rendering a placeholder despite committed server/UI modules;
- GitHub Operations CSS files existing without being loaded by the root document;
- partial provider evidence incorrectly finishing a synchronization as `success`;
- unexpected provider exceptions aborting the whole synchronization before `finishRun`;
- acceptance of the default branch producing a false branch-change audit when `active_branch` was null;
- recommendation IDs omitted from the private read model used by stale-state protection;
- paused targets being hidden instead of remaining visible as historical operational state;
- repository-target registration using nonexistent `html_url` and `primary/secondary` schema values;
- repository synchronization attempting to update nonexistent `html_url` and `archived` repository status values;
- GitHub synchronization overwriting manual target state beyond provider metadata;
- GitHub run inserts omitting the legacy required `trigger`, `repositories_checked` and `changes_applied` fields;
- backup and migration gates stopping at `0003` after the sync-run migration was added;
- SQLite tests using stale repository columns, roles and incomplete sync-run fixtures;
- MCP roadmap resource validation failure being nested inside a false success envelope;
- MCP test resource assertions accessing text without narrowing blob/text content.

### Verified in the current environment

- stage validation equivalent suite: 4 passing tests;
- local auth/session equivalent suite: 2 passing tests;
- public confidentiality scanner behavior;
- upstream and domain-boundary guardrail behavior;
- Node.js 22 availability;
- connector-visible branch and PR state after each remote commit;
- official MCP SDK v1.29.0 source signatures reviewed through connected official sources.

The SDK source review verifies static API alignment only; it is not a passing runtime or typecheck gate.

### Specified by committed tests but not yet executed here

- attention write validation, mapping, optimistic conflicts and audit rollback;
- session handoff normalization and explicit test-status persistence;
- evidence URL/status policy and transactional audit;
- guarded stage completion and stale-write rejection;
- backup creation, no-overwrite, migration state and restored content;
- audit pagination and malformed historical JSON handling;
- all four SQLite migrations applied idempotently;
- GitHub REST request construction, response validation, ETags and rate limits;
- provider identity/HTTPS rejection and immediate stop after rate limiting;
- deterministic branch recommendation and partial observation semantics;
- immutable observation idempotency and transaction rollback;
- GitHub run lifecycle, legacy/extended counter compatibility and manual-state preservation;
- target registration with canonical roles, duplicate detection and audit rollback;
- target pause/reactivation concurrency and audit rollback;
- latest-recommendation acceptance, default-branch no-op and stale-state rejection;
- private Operations dashboard empty, configured, partial and paused-target states;
- anonymous confidentiality for repository identities, branches and sync metadata;
- DevOS read-service delegation, slug validation and roadmap-filter normalization;
- MCP catalog discovery and read-only annotations;
- MCP structured tool results and static JSON resources;
- MCP project not-found/invalid-input mapping;
- sanitization of unexpected MCP tool/resource failures;
- SQLite-to-MCP reads through the official in-memory protocol transport;
- absence of mutation tools from the MCP catalog.

### Not yet verified

- dependency installation and generated `pnpm-lock.yaml`;
- full TypeScript workspace check;
- Vitest workspace execution;
- MCP SDK package installation and protocol suite execution;
- TanStack Start production build;
- authenticated browser checks for operational writes and Operations controls;
- GitHub token permissions and live provider behavior from the application runtime;
- backup CLI execution against a real file-backed database after migration `0004`;
- browser E2E, keyboard and 360 px responsive visual review;
- authenticated MCP transport, remote client compatibility and host behavior;
- production host composition, deployment and rollback.

### Constraints

- the current shell registry reports the scoped MCP SDK as unavailable and direct public GitHub access fails DNS, so the new package cannot be installed or executed here;
- committed tests remain specifications rather than passage evidence until observed in a dependency-complete environment;
- connected Figma access is view-only, so editable design frames are not claimed as complete;
- no Notion migration, GitHub write, MCP remote exposure or public deployment has been performed;
- no recommendation acceptance or repository-target mutation has been exercised through a built browser session;
- the MCP server factory intentionally opens no listener and must not be described as a deployed endpoint.
