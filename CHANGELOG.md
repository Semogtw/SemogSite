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

#### Remote MCP and Gemini Spark planning

- approved provider-neutral design for a separately deployable Mode B remote MCP bridge;
- planned framework-free `packages/mcp-auth` authorization core;
- planned additive migration `0014_mcp_oauth.sql` with digest-only OAuth client/code/token persistence;
- planned owner-managed preregistration, Dynamic Client Registration, authorization code and mandatory PKCE S256;
- planned private DevOS client management/consent and dedicated Node 22 `apps/mcp-http` runtime;
- planned OAuth discovery, token rotation/revocation, authenticated stateless Streamable HTTP, limits, sanitized telemetry and independent kill switch;
- executable remote transport/Spark plan and separate six-tool workflow/recovery read-catalog plan;
- Gemini Spark treated as an optional compatibility target rather than a domain or subscription dependency;
- specification and plan indexes updated so the 2026-08-01 transport reservation remains historical rather than executable current guidance.

This entry records documentation and approved planning only. No OAuth migration, network endpoint, remote client, Spark custom app or MCP write tool has been implemented by these commits.

#### Learning, Growth, Evidence and Credentials planning

- approved provider-neutral Growth design with DevOS as the canonical source of learning state;
- planned migration `0015_learning_goals.sql` for goals, ordered weighted checkpoints, skills/aliases and append-only events;
- planned progress derivation from checkpoint state/accepted numeric values, with no canonical percentage column or direct percentage mutation;
- planned migration `0016_learning_evidence_credentials.sql` for evidence candidates/claims/reviews/policies and credentials;
- planned owner-review-first evidence flow with narrow deterministic auto-accept rules that explicitly exclude LLM-only classification, keywords and file extensions;
- planned GitHub evidence references bound to normalized repository/branch/SHA/PR/workflow observations without treating code presence as proof of comprehension;
- planned credential states, normalized Gmail/Spark metadata proposals and optional private attachment references outside SQLite;
- three executable plans for the Growth core, evidence/credentials and read-only Growth MCP/Spark workflows;
- six planned Growth read tools under existing `devos.read` after their domain and remote endpoint dependencies pass;
- desired supervised write/proposal operations documented but blocked behind a separate post-gate write-authorization specification;
- concise roadmap entry point added at `docs/LEARNING_GROWTH.md`.

This entry also records documentation and approved planning only. No Growth route/table/tool, certificate import, Gmail monitor or canonical Spark write has been implemented by these commits.

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

The documentation reconciliation, remote-MCP planning and Growth planning commits after that run require fresh applicable gates during implementation; planning-only changes do not constitute OAuth, transport, Growth, credential or client compatibility evidence.

### Constraints and remaining work

- no production host or deployment mode is selected;
- no public deployment is authorized;
- no remote MCP, OAuth migration, stdio listener or external-agent transport is enabled;
- remote MCP implementation must follow the 2026-08-03 specification and executable plans rather than the historical 2026-08-01 transport reservation;
- Gemini Spark exists in the owner's Brazilian AI Pro account, but **Custom apps for Spark** must still be observed separately before Spark acceptance can pass;
- no Growth migration, private Growth route, evidence pipeline, credential store or Growth MCP tool is implemented;
- live GitHub token permissions/provider behavior still require validation in the selected runtime;
- no Notion content migration has been performed;
- backup encryption/upload/retention remain operational responsibilities;
- multi-instance authentication and remote-MCP throttling require shared limiters;
- host-specific CSP, cache, cookie, logs, private attachment storage and rollback remain to be verified;
- branch inactivity is not proof that an AI session completed;
- provider-specific prompt launching/automation remains outside the remote read plans;
- no MCP write scope or mutation tool is authorized until authenticated read phases, Growth browser flows, client confirmation behavior and rollback are verified.
