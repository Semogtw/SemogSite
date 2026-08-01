# Testing

## Standard commands

```bash
corepack enable
pnpm install --frozen-lockfile=false
pnpm check
pnpm build
```

Package-specific examples:

```bash
pnpm --filter @semogtw/domain test
pnpm --filter @semogtw/auth test
pnpm --filter @semogtw/contracts test
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/github test
pnpm --filter @semogtw/mcp test
pnpm --filter @semogtw/mcp-app test
pnpm --filter @semogtw/api test
pnpm --filter @semogtw/ui test
pnpm --filter @semogtw/web test
```

## Required matrix

### Unit

- stage invariants;
- Today ordering and project-slug continuity;
- Roadmap filtering/grouping;
- agent-context sanitization and size cap;
- attention capture/lifecycle validation and optimistic conflicts;
- session handoff SHA normalization and explicit test-status preservation;
- manual evidence allowlists and HTTPS URL validation;
- guarded stage completion through canonical invariants;
- deterministic branch recommendation, aliases, ties and stability windows;
- partial provider observations producing partial parent runs;
- provider exceptions contained per repository;
- branch acceptance rejecting stale recommendations, stale active state and default-branch no-ops;
- repository-target registration canonicalizing `owner/name`, branch and canonical role;
- repository-target lifecycle validation, no-op and stale-state rejection;
- GitHub REST GET-only requests, encoding, version headers, ETags and rate-limit errors;
- provider identity and credential-free HTTPS validation;
- immediate stop of branch commit reads after rate limiting;
- DevOS read-service delegation without DTO rewriting;
- project-slug normalization and invalid-input/not-found distinction;
- bounded, deduplicated roadmap filter normalization;
- MCP tool/resource catalog containing no mutation operation;
- MCP read-only annotations and stable sanitized error codes;
- MCP successful tools returning text plus `structuredContent`;
- MCP resources returning consistent JSON success/error envelopes;
- public DTO allowlists;
- password hashing, session expiry/revocation, CSRF and throttling;
- safe post-login destination allowlist;
- browser cookie parsing and fail-closed runtime configuration.

### Integration

- migrations `0001` through `0004` applied idempotently;
- `0004_github_sync_runs.sql` preserving legacy fields while adding detailed GitHub counters;
- Drizzle `syncRuns` mapping matching the migrated SQLite table;
- backup verification requiring all four migrations;
- attention, handoff, evidence and stage mutations with atomic audit rollback;
- GitHub observation aggregate atomicity and source-hash idempotency;
- malformed historical recommendation and run JSON sanitized on reads;
- GitHub runs populating both legacy and extended counters;
- repository metadata refresh preserving `active_branch`, role, target status and `sync_enabled`;
- canonical operational column `github_url` used for repository targets;
- provider observation `html_url` retained only in immutable observation records;
- repository-target registration validating project existence and case-insensitive duplicates;
- target pause/reactivation updating only `sync_enabled` and `updated_at`;
- latest recommendation ID rechecked inside branch-acceptance transaction;
- audit insertion failure rolling back registration, lifecycle and branch decisions;
- paused active targets visible in Operations but excluded from enabled-target count;
- semantic repository ordering by `product`, `core`, `integration`, `infrastructure`, `academic`, `experiment`;
- SQLite Overview, Today, Projects/hub and Roadmap data sources;
- SQLite `DevOSReadService` composition using those canonical sources;
- official MCP `Client` and `InMemoryTransport` discovering the expected catalog;
- MCP tools/resources returning the migrated demo database state;
- MCP composition returning a server without opening stdio, HTTP or another listener;
- Hono public/private isolation and private `no-store` headers;
- private service not called before authorization;
- Node/SQLite auth composition and 14-day session lifetime;
- TanStack private route redirect before data loader;
- public route metadata, anonymous rendering and mobile-menu accessibility.

### MCP protocol gate

The protocol suite must verify with the official TypeScript SDK:

- exact discovery order and names for four resources and five tools;
- all tools advertise read-only, non-destructive, idempotent and closed-world annotations;
- no tool name or definition represents a mutation;
- output schemas accept the returned `structuredContent`;
- missing projects map to `PROJECT_NOT_FOUND`;
- invalid project/roadmap inputs return stable errors;
- unexpected exception messages, database details and token-like strings never reach protocol content;
- static resources and tools read through the same service instance;
- SQLite composition exposes demo data only after migrations run;
- client/server close cleanly after in-memory tests.

### E2E, before deployment

- anonymous public routes at 360 × 800 and desktop;
- `/devos` redirect, login, logout, CSRF rejection and revoked-session denial;
- authenticated Overview, Hoje, Projetos, hub, Roadmap, Operação and Auditoria;
- attention, handoff, evidence and stage-completion flows with audit evidence;
- Operations with no token, no targets, enabled targets and paused targets;
- private repository-target registration without any GitHub network request;
- confirmed GitHub read creating a run and immutable observations;
- provider partial/rate-limited state retaining valid evidence and showing reset time;
- synchronization never changing the active branch or target lifecycle fields;
- branch acceptance requiring reason/confirmation and sending no GitHub write;
- a newer recommendation or concurrent active-branch change rejecting acceptance without audit;
- pause/reactivation requiring reason/confirmation and retaining historical observations;
- repository identities, URLs, branches, recommendations and run metadata absent from anonymous output;
- no horizontal overflow, visible focus and keyboard navigation;
- public HTML/payload/metadata/sitemap/robots confidentiality scan;
- private API/page cache behavior on the selected host.

A remote MCP endpoint has a separate future E2E matrix. It is not part of the current in-process adapter and must cover transport authentication, session isolation, TLS/origin/host policy, rate limits, timeouts, cache prevention, revocation and sanitized logs before exposure.

## Evidence from this implementation environment

The connected environment provides Node.js `v22.16.0`, but the current shell registry reports the scoped MCP SDK as unavailable and direct public GitHub access fails DNS resolution. The repository is modified through the connected GitHub tool rather than a dependency-capable local clone. Therefore the new MCP package installation, TypeScript checking, Vitest protocol suite and production build are **not claimed as executed**.

Official v1.29.0 package metadata and source signatures were reviewed through connected official sources. This supports static API alignment but is not runtime passage evidence.

Equivalent behavior previously exercised with Node-native facilities:

- roadmap stage validation: 4 tests passed, 0 failed;
- local password/session provider: 2 tests passed, 0 failed;
- public confidentiality scanner behavior: passed;
- upstream marker and domain-boundary scanner behavior: passed.

The GitHub connector has been used to inspect the actual remote branch after each group of changes. This verifies persistence of commits, not compilation or runtime correctness.

Committed Vitest suites are specifications until observed in a dependency-complete environment. The presence of a test file is never recorded as a passing gate.

## First dependency-complete environment

Run, in order:

```bash
corepack enable
pnpm install --frozen-lockfile=false
pnpm --filter @semogtw/domain test
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/mcp test
pnpm --filter @semogtw/mcp-app test
pnpm --filter @semogtw/github test
pnpm --filter @semogtw/web test
pnpm check
pnpm build
```

Because no lockfile exists yet, the first successful install must create and commit `pnpm-lock.yaml` immediately. Confirm that the resolved MCP SDK remains on the reviewed stable v1.x line and record the exact version.

Then use a file-backed database:

```bash
pnpm --filter @semogtw/web dev
```

Verify migrations `0001`–`0004`, create a synthetic private project/repository target, run the no-token and token-configured Operations states, rehearse backup/restore, and execute anonymous confidentiality checks. Fix framework, ORM or SDK API mismatches from current official documentation and record exact evidence in `CHANGELOG.md`.

Do not expose an MCP transport merely because the in-memory suite passes. Create and execute the authenticated Streamable HTTP plan first.

GitHub Actions should not be used merely to compensate for this environment limitation. Prefer a local or agent runtime with package access; use CI only when it becomes an essential release gate.
