# Semogtw Repository Target Lifecycle and Schema Reconciliation Plan

**Goal:** Allow the authenticated owner to pause and reactivate repository observation targets without deleting evidence, while keeping target registration and GitHub synchronization compatible with the canonical SQLite schema.

## Invariants

- Target lifecycle mutations are local DevOS writes and send no GitHub request.
- Owner session, CSRF, reason and confirmation are mandatory.
- Pause/reactivation changes only `sync_enabled` and `updated_at`.
- Historical observations, recommendations, accepted active branch and provider identity are preserved.
- Expected `sync_enabled` and `updated_at` must still match at commit time.
- Mutation and audit insertion are atomic.
- Paused active targets remain visible in Operations and are excluded from new runs.
- Repository targets use canonical `github_url` and roles from `0001_foundation.sql`.
- Provider observations use their own immutable `html_url` field.
- New GitHub runs populate both the legacy and extended `sync_runs` fields.

## Task 1: Domain lifecycle service

- [x] Specify enable/disable inputs, validation, no-op, stale state and conflict results.
- [x] Build before/after snapshots and distinct enable/disable audit actions.
- [x] Export the service and contracts.
- [ ] Execute focused domain tests in a dependency-complete environment.

## Task 2: SQLite lifecycle transaction

- [x] Hydrate target ID, full name, enabled state and timestamp.
- [x] Update only `sync_enabled` and `updated_at` optimistically.
- [x] Insert the audit event in the same immediate transaction.
- [x] Specify stale-state and audit-failure rollback.
- [ ] Execute focused database tests.

## Task 3: Private Operations controls

- [x] Add an owner/CSRF-protected server function.
- [x] Keep paused targets visible in the private dashboard.
- [x] Count only enabled targets for the next run.
- [x] Add reason, confirmation and post-commit route invalidation.
- [x] Disable the sync trigger when no target is enabled.
- [ ] Execute authenticated desktop and 360 px browser checks.

## Task 4: Canonical repository schema reconciliation

- [x] Replace operational `html_url` references with `github_url`.
- [x] Replace invented `primary/secondary` roles with `product`, `core`, `integration`, `infrastructure`, `academic`, `experiment`.
- [x] Preserve role, status, lifecycle and active branch during GitHub metadata refresh.
- [x] Update database fixtures and forms to use canonical values.
- [ ] Run the full database suite against a freshly migrated in-memory database.

## Task 5: Sync-run evolution

- [x] Add `0004_github_sync_runs.sql` as an additive migration.
- [x] Preserve legacy `trigger`, `repositories_checked` and `changes_applied` fields.
- [x] Add integration, detailed counters, rate limits and metadata.
- [x] Populate both generations for new GitHub runs.
- [x] Update Drizzle mapping, migration gate and backup expectations.
- [ ] Execute migration idempotency and backup/restore gates.

## Current checkpoint

Implementation and static reconciliation are committed on `develop/foundation-bootstrap`. The branch includes the private Operations route, registration, pause/reactivation, recommendations, branch decisions, all four migrations and updated tests/documentation.

The current runtime cannot resolve `registry.npmjs.org`; therefore no TypeScript, Vitest, build or browser success is claimed. The exact next action is to install dependencies in a network-capable environment, commit `pnpm-lock.yaml`, run domain/GitHub/database/web tests, then `pnpm check` and `pnpm build`.
