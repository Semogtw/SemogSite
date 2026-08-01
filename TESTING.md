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
- Hono public/private isolation and private `no-store` headers;
- private service not called before authorization;
- Node/SQLite auth composition and 14-day session lifetime;
- TanStack private route redirect before data loader;
- public route metadata, anonymous rendering and mobile-menu accessibility.

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

## Evidence from this implementation environment

The connected environment provides Node.js `v22.16.0`, but the current runtime cannot resolve `registry.npmjs.org` and cannot clone the private repository into a dependency-capable local workspace. Therefore dependency installation, TypeScript checking, Vitest and the Vite production build are **not claimed as executed**.

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
pnpm --filter @semogtw/github test
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/web test
pnpm check
pnpm build
```

Because no lockfile exists yet, the first successful install must create and commit `pnpm-lock.yaml` immediately.

Then use a file-backed database:

```bash
pnpm --filter @semogtw/web dev
```

Verify migrations `0001`–`0004`, create a synthetic private project/repository target, run the no-token and token-configured Operations states, rehearse backup/restore, and execute anonymous confidentiality checks. Fix framework or ORM API mismatches from current official documentation and record exact evidence in `CHANGELOG.md`.

GitHub Actions should not be used merely to compensate for this environment limitation. Prefer a local or agent runtime with package access; use CI only when it becomes an essential release gate.
