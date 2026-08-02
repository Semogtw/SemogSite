# Semogtw Audited Branch Recommendation Acceptance Plan

> **For agentic workers:** Use TDD and commit each reviewable unit. A recommendation remains evidence until this separate owner mutation succeeds.

**Goal:** Allow the authenticated owner to accept the latest persisted branch recommendation as the DevOS active branch without writing to GitHub, while rejecting stale UI state and preserving a complete audit trail.

## Invariants

- The operation never calls GitHub.
- Owner session and CSRF are revalidated server-side.
- Explicit reason and confirmation are mandatory.
- The recommendation ID submitted by the UI must still be the latest recommendation for the repository.
- Only a `recommended` record with a non-empty branch can be accepted.
- The current active branch must match the state observed by the UI.
- Accepting the already-active branch is rejected as a no-op.
- `repositories.active_branch`, `updated_at` and the `repository.active_branch.accept` audit event are committed atomically.
- A concurrent repository or recommendation change returns a conflict and writes no audit event.
- GitHub synchronization continues to avoid writing `active_branch`.

## Task 1: Domain service

- [ ] Add recommendation acceptance snapshots, repository port and result codes.
- [ ] Specify validation, missing recommendation, stale recommendation, no-op and conflict behavior.
- [ ] Build before/after audit snapshots without provider dependencies.
- [ ] Export the service/contracts.

## Task 2: SQLite repository

- [ ] Read repository plus its latest recommendation.
- [ ] Re-check latest recommendation inside the write transaction.
- [ ] Update `active_branch` optimistically without changing provider metadata.
- [ ] Insert the audit event in the same transaction.
- [ ] Specify rollback on audit failure and stale recommendation/repository conflicts.

## Task 3: Protected server action and UI

- [ ] Add owner/CSRF-protected POST server function.
- [ ] Expose recommendation IDs only through the private read model.
- [ ] Add reason, confirmation and accept button to the Operation panel.
- [ ] Refresh the dashboard after success.
- [ ] Never label the recommendation accepted before the committed response.

## Task 4: Documentation and gates

- [ ] Update data model, security, runbook, testing and changelog.
- [ ] Run focused domain/database/web tests in a dependency-complete environment.
- [ ] Verify stale concurrent acceptance and audit rollback in SQLite.
- [ ] Verify the accepted branch changes only DevOS state, not GitHub.
- [ ] Keep PR draft until all gates are observed.
