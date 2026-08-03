# Workflow Orchestration Core Implementation Plan

**Status:** First implementation slice completed and verified on 2026-08-03.

**Canonical branch:** `develop/workflow-control-core`

**Verified remote content:** `94956d10f805e13af7f11e5e2e4f63e8e4abe4b8`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the provider-agnostic orchestration core for scope reservations, verification obligations, recovery snapshots and safe-work selection without making remote MCP a prerequisite.

**Architecture:** Add focused domain services under `packages/domain/src/orchestration`, additive SQLite schema/repositories under `packages/database`, and owner-only DevOS composition after the domain contracts are stable. GitHub, web, API and MCP remain adapters; the first slices are valid with local persistence and manual owner actions only.

**Tech Stack:** TypeScript, Vitest, Drizzle schema metadata, raw SQLite migrations, better-sqlite3 repositories, TanStack Start/Router, Zod and existing audit/idempotency conventions.

## Global Constraints

- Core workflow tracking must not require ChatGPT Sites, ChatGPT Plus, paid OpenAI APIs, remote MCP or one AI provider.
- Every new field is owner-private and excluded from public DTOs.
- Every mutation is bounded, idempotent, optimistic and auditable.
- GitHub remains read-only.
- Expiration and staleness must be derivable lazily without schedulers.
- Tests are written before production behavior.
- Commit and push after every independently reviewable unit.

---

### Task 1: Scope overlap model

**Files:**
- Create: `packages/domain/src/orchestration/scope-reservation.ts`
- Create: `packages/domain/src/orchestration/scope-reservation.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces: `normalizeScopePatterns(patterns)`, `scopeReservationsOverlap(left, right, observedAt)`, `deriveScopeReservationFreshness(reservation, observedAt)` and the `ScopeReservationSnapshot` family of types.
- Consumes: no persistence or framework dependency.

- [x] Write failing tests for path normalization, unsafe patterns, exact/file-directory overlap, repository-wide overlap, expired reservations and different repositories/branches.
- [x] Run the focused Vitest file and confirm failures are caused by missing production exports.
- [x] Implement the minimal deterministic normalization, freshness and overlap rules.
- [x] Run the focused tests and package typecheck.
- [x] Export the contracts from `packages/domain/src/index.ts` and commit.

### Task 2: Scope reservation lifecycle service

**Files:**
- Create: `packages/domain/src/orchestration/scope-reservation-service.ts`
- Create: `packages/domain/src/orchestration/scope-reservation-service.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Consumes: Task 1 scope types and overlap functions.
- Produces: `ScopeReservationService.acquire`, `.renew`, `.release`, `.override` plus repository and audit-event contracts.

- [x] Write failing tests for validation, idempotent acquire, overlap conflict, acknowledged overlap, renewal ownership, bounded expiry, release and owner override.
- [x] Run focused tests and observe RED.
- [x] Implement minimal service behavior with stable error codes and repository result mapping.
- [x] Run focused tests/typecheck and commit.

### Task 3: Scope persistence

**Files:**
- Create: `packages/database/migrations/0011_scope_reservations.sql`
- Create: `packages/database/src/schema/orchestration.ts`
- Create: `packages/database/src/repositories/scope-reservation-repository.ts`
- Create: `packages/database/src/repositories/scope-reservation-repository.test.ts`
- Modify: `packages/database/src/schema/index.ts`
- Modify: `packages/database/src/index.ts`
- Modify: migration manifest and migration/backup tests that enumerate migrations.

**Interfaces:**
- Consumes: Task 2 repository contracts.
- Produces: SQLite implementation with immediate transactions, compare-and-swap, append-only audit events and active-overlap reads.

- [x] Write failing repository and migration tests.
- [x] Add additive tables and indexes for reservations.
- [x] Implement atomic acquire/renew/release/override persistence.
- [x] Run focused migration/repository/backup tests and commit.

### Task 4: Verification obligation model and service

**Files:**
- Create: `packages/domain/src/orchestration/verification-obligation-service.ts`
- Create: `packages/domain/src/orchestration/verification-obligation-service.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces: create, attempt-result, supersede and waive commands; exact SHA validity; failure classification; normalized failure signature.

- [x] Write failing tests for exact branch/SHA binding, environment-missing classification, pass/fail attempts, equivalent failure signatures, supersede and owner waiver.
- [x] Run focused tests and observe RED.
- [x] Implement minimal domain service and stable repository contracts.
- [x] Run focused tests/typecheck and commit.

### Task 5: Verification persistence

**Files:**
- Create: `packages/database/migrations/0012_verification_obligations.sql`
- Modify: `packages/database/src/schema/orchestration.ts`
- Create: `packages/database/src/repositories/verification-obligation-repository.ts`
- Create: `packages/database/src/repositories/verification-obligation-repository.test.ts`
- Modify: `packages/database/src/index.ts`

**Interfaces:**
- Consumes: Task 4 contracts.
- Produces: atomic obligation, attempt and audit persistence with duplicate-failure grouping.

- [x] Write failing repository tests.
- [x] Add obligation/attempt tables and indexes.
- [x] Implement create/result/supersede/waive transactions.
- [x] Run focused tests and commit.

### Task 6: Recovery snapshot renderer

**Files:**
- Create: `packages/domain/src/orchestration/recovery-snapshot.ts`
- Create: `packages/domain/src/orchestration/recovery-snapshot.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces: deterministic canonical JSON snapshot, Markdown export and SHA-256-ready canonical string from a fully supplied private snapshot input.

- [x] Write failing deterministic rendering, ordering, warning and redaction tests.
- [x] Implement pure rendering without database or Node crypto dependency.
- [x] Run focused tests/typecheck and commit.

### Task 7: Safe-work evaluator

**Files:**
- Create: `packages/domain/src/orchestration/safe-work-service.ts`
- Create: `packages/domain/src/orchestration/safe-work-service.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Consumes: stages, reservations, obligations and runtime capabilities supplied as immutable projections.
- Produces: ordered `SafeWorkRecommendation[]` with reasons and exclusion codes; never mutates roadmap state.

- [x] Write failing prioritization and exclusion tests.
- [x] Implement deterministic scoring and explanation output.
- [x] Run focused tests/typecheck and commit.

### Task 8: Owner-only composition and documentation

**Files:**
- Create/modify owner-only server modules and DevOS project/run routes following existing patterns.
- Modify: `ARCHITECTURE.md`, `DATA_MODEL.md`, `RUN_LEDGER.md`, `RUNBOOK.md`, `SECURITY.md`, `TESTING.md`, `README.md`, `docs/superpowers/plans/README.md`.

**Interfaces:**
- Consumes: Tasks 2–7 services/repositories.
- Produces: private projections and bounded owner mutations for reservations, obligations and snapshot preview/export.

- [x] Write route/server tests before UI implementation.
- [x] Add owner-authenticated server composition.
- [x] Add project/run UI sections with conservative copy and 360 px behavior.
- [x] Add confidentiality tests and documentation reconciliation.
- [x] Run focused tests, full `pnpm check`, build and browser gates; document unavailable gates and commit.


## Completion evidence

Observed locally with the verified offline toolchain against content equivalent to remote commit `94956d10f805e13af7f11e5e2e4f63e8e4abe4b8` (`83e4ba5` plus the sole one-line E2E selector refinement):

- package-boundary and public-confidentiality scanners passed;
- orchestration domain: 7 files / 34 tests passed;
- focused orchestration persistence: 10 files / 33 tests passed;
- workflow owner controls: 2 files / 8 tests passed;
- all package typechecks passed;
- all workspace test scripts passed serially: 157 files / 600 tests;
- production web build passed and the server bundle contained all 13 migrations with none in the client bundle;
- Playwright workflow orchestration suite passed 6/6, including anonymous isolation, owner navigation, explicit capabilities, 360 × 800 usability, target registration, reservation acquisition/override, classified gate result and fail-closed recovery without a matching GitHub observation.

The aggregate `pnpm check` completed every guardrail and typecheck, then exceeded the external command limit while the monorepo Vitest workspace was running. The same workspace suites were subsequently executed package-by-package and all 600 tests passed. This is an executor-limit classification, not a code failure.

Recovery persistence was implemented as the additive `0013_recovery_snapshots.sql` migration with immutable repository, source and read-model coverage. The implementation deliberately expanded beyond the original pure-renderer-only Task 6 while preserving the documented domain boundary.

The first orchestration slice is complete. Campaigns, CI failure clustering, branch-divergence coordination, execution profiles and runtime catalogs belong to separate follow-up plans rather than unchecked work in this plan.

## Verification order

1. focused domain tests;
2. focused SQLite repository/migration tests;
3. `pnpm --filter @semogtw/domain test` and typecheck;
4. `pnpm --filter @semogtw/database test` and typecheck;
5. confidentiality/guardrail scripts;
6. `pnpm check`;
7. `pnpm build`;
8. authenticated and anonymous browser gates.

When the current execution environment cannot install or run a gate, record a structured verification obligation instead of treating the missing environment as a code failure, then continue the next resolvable implementation task.
