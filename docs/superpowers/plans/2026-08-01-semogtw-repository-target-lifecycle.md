# Semogtw Audited Repository Target Lifecycle Plan

**Goal:** Allow the authenticated owner to pause or reactivate GitHub observation targets without deleting repositories, observations, recommendations or audit history.

## Invariants

- Lifecycle changes are local DevOS mutations and send no request to GitHub.
- Owner session, CSRF, explicit reason and confirmation are mandatory.
- The browser submits the expected current `sync_enabled` and `updated_at` state.
- The repository must still exist and match that expected state.
- Enabling an already-enabled target or disabling an already-disabled target is rejected as a no-op.
- Only `sync_enabled` and `updated_at` change.
- Repository identity, active/default branch, provider metadata and historical observations remain untouched.
- The mutation and `repository.sync_target.enable` or `repository.sync_target.disable` audit event are atomic.
- A stale write or audit failure leaves the target unchanged.

## Task 1: Domain lifecycle service

- [ ] Specify validation, not-found, stale, no-op and conflict results.
- [ ] Build before/after snapshots and action-specific audit events.
- [ ] Export provider-neutral contracts.

## Task 2: SQLite lifecycle repository

- [ ] Hydrate the target state.
- [ ] Optimistically update only `sync_enabled` and `updated_at` in an immediate transaction.
- [ ] Insert the action-specific audit event atomically.
- [ ] Specify stale-write and audit-failure rollback.

## Task 3: Protected UI

- [ ] Include `sync_enabled` and `updated_at` in the private operations read model.
- [ ] Add an owner/CSRF-protected POST server function.
- [ ] Add reason/confirmation lifecycle controls to each repository card.
- [ ] Refresh only after committed success.

## Task 4: Documentation and gates

- [ ] Update testing, security, data model, runbook and changelog.
- [ ] Run focused tests/typecheck/build in a dependency-complete environment.
- [ ] Verify paused targets are excluded from later sync runs while evidence remains visible.
