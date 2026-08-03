# Changelog

All notable changes to Semogtw Platform are recorded here. Dates use `America/Bahia` for presentation; Git timestamps remain UTC.

## Unreleased — Portable Semogtw Platform and workflow orchestration

### Added

#### Platform foundation

- pnpm TypeScript monorepo with strict compiler settings and enforced package boundaries;
- TanStack Start public/private web surface and Hono API partition;
- SQLite/Drizzle persistence with 13 inspectable additive migrations;
- revocable owner authentication, PBKDF2 password hashes, token-digest sessions, CSRF and throttling;
- allowlisted public serializers and `no-store` private responses;
- Semogtw design tokens, accessible primitives and responsive navigation;
- verified SQLite backup/restore library and CLIs;
- owner-only audit review with malformed historical JSON tolerance.

#### Operational DevOS

- attention capture/lifecycle, session handoffs, evidence and guarded stage completion;
- provider-neutral branch recommendation and local audited acceptance;
- isolated read-only GitHub REST adapter with bounded requests, ETags and typed rate limits;
- immutable repository/branch/recommendation observations and partial-run semantics;
- owner-only Operations dashboard;
- private repository target registration and pause/reactivation;
- cooperative run ledger, checkpoints, command inbox/queue and transitions.

#### Workflow orchestration core

- migration `0011_scope_reservations.sql`;
- normalized cooperative reservations over repository, branch and bounded scope;
- deterministic overlap detection and expiration derived at read time;
- acquire, renew, release and owner override with optimistic concurrency, idempotency, events and audit;
- mutation-context binding before repository access;
- migration `0012_verification_obligations.sql`;
- exact-command verification obligations bound to full 40-character commit SHAs;
- explicit result classes including `code_failure`, `environment_missing`, timeout, quota, configuration and external dependency;
- owner-only result recording, supersede and waiver lifecycle;
- migration `0013_recovery_snapshots.sql`;
- deterministic canonical recovery snapshots with SHA-256, bounded Markdown and credential/path rejection;
- fail-closed recovery source using only the accepted branch and persisted matching GitHub observation;
- immutable recent-snapshot history with clipboard and manual-selection fallback;
- conservative persisted safe-work source using roadmap stages, repository targets, reservations and gates;
- explicit exclusions for missing/ambiguous repositories, previous-stage dependencies, owner locks, overlaps and unavailable capabilities;
- session-only runtime capability evaluation with an empty conservative default;
- private routes `/devos/workflows` and `/devos/workflows/recovery`;
- detached sibling recovery route preserving the public URL without an unintended route-parent dependency;
- CI gate covering native SQLite, scanners, focused tests, repository-wide check, production build and Playwright.

#### Editorial and public surfaces

- owner-only editorial documents/revisions/review/publication/withdrawal/rollback lifecycle;
- immutable revisions and approval by exact content hash;
- public projections sourced only from approved published revisions;
- safe Markdown renderer without raw HTML;
- canonical/noindex behavior and append-only alias registry with `308`/`no-store` redirects.

#### MCP read adapter

- provider-neutral `DevOSReadService` for Overview, Today, Projects and Roadmap;
- `@semogtw/mcp` catalog with four resources and five read-only tools;
- bounded inputs/outputs, structured results and sanitized stable errors;
- `apps/mcp` SQLite composition returning an in-process `McpServer` without opening a listener;
- official in-memory protocol tests and package/runtime boundary guardrails.

### Fixed during implementation and review

- login limiter result treated incorrectly as a boolean;
- cookie environment type and redirect handling;
- CSRF cookie path for TanStack server-function RPC;
- public projects serializer behavior for incomplete private records;
- semantic priority ordering and project-slug Today links;
- native `better-sqlite3` SSR externalization and CI hydration;
- audit filtering before ordering/pagination;
- backup reopening/restoration verification;
- GitHub run compatibility with legacy required fields;
- synchronization accidentally attempting to overwrite manual repository state;
- default-branch recommendation acceptance false audit;
- missing recommendation IDs in stale-state protection;
- paused targets hidden instead of retained as history;
- Operations placeholder/CSS composition regressions;
- partial provider evidence incorrectly reported as success;
- provider exceptions aborting a parent run before finalization;
- MCP validation/error envelopes and content-type narrowing;
- workflow dashboard omitting override/result/recovery controls already implemented;
- reservation/obligation mutations accepting mismatched context identities;
- recovery route rendered as a child of a non-layout route;
- stale fixtures using nonexistent GitHub observation columns;
- native build approval attempting an interactive CI prompt;
- invalid UI button tones;
- ambiguous Playwright selectors for accessible status and classification controls.

### Verified on August 3, 2026

Workflow run `30841132598` for commit `94956d10f805e13af7f11e5e2e4f63e8e4abe4b8` observed:

- frozen dependency installation with `better-sqlite3` native module present;
- upstream, domain, MCP, ledger, editorial and public-confidentiality guardrails;
- all workspace typechecks;
- 151 Vitest files and 576 passing tests in the aggregated monorepo gate;
- 34 focused orchestration-domain tests;
- 33 focused persistence/migration/backup tests;
- 8 focused web/control tests;
- production client and SSR build;
- 13 migration files present server-side and absent client-side;
- six focused Playwright scenarios passing;
- anonymous redirects before workflow content;
- no workflow-only markers on the public homepage;
- authenticated dashboard/recovery navigation;
- explicit session capability evaluation;
- no horizontal overflow at 360 × 800;
- private target registration;
- reservation creation and owner override;
- exact-SHA gate creation and `blocked/environment_missing` result;
- recovery generation failing closed without a persisted GitHub branch observation.

The documentation reconciliation commits after that run require one final full workflow execution before merge.

### Constraints and remaining work

- no production host or deployment mode is selected;
- no public deployment is authorized;
- no remote MCP, stdio listener or external-agent transport is enabled;
- live GitHub token permissions/provider behavior still require validation in the selected runtime;
- no Notion content migration has been performed;
- backup encryption/upload/retention remain operational responsibilities;
- multi-instance authentication throttling requires a shared limiter;
- host-specific CSP, cache, cookie, logs and rollback remain to be verified;
- branch inactivity is not proof that an AI session completed;
- a future inactivity detector and ChatGPT continuation launcher require a separately approved design;
- temporary one-shot workflow executors are removed in draft cleanup PR #18 and should not survive the final integration.