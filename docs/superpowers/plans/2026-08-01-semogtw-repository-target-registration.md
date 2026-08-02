# Semogtw Audited Repository Target Registration Plan

**Goal:** Let the authenticated owner register a GitHub repository as a DevOS synchronization target without exposing the token or requiring direct SQL.

## Invariants

- Registration is a local DevOS mutation and sends no request to GitHub.
- Owner session, CSRF, explicit reason and confirmation are mandatory.
- Repository identity is accepted only as canonical `owner/name` with conservative GitHub-compatible characters.
- The generated repository URL is credential-free HTTPS.
- New targets start as private, active, sync-enabled and manual-source records.
- Provider metadata remains unverified until a later read synchronization.
- Duplicate full names are rejected case-insensitively.
- The referenced project must exist.
- Repository creation and `repository.sync_target.create` audit insertion are atomic.
- Failure or audit rollback leaves no target row.

## Task 1: Domain registration service

- [ ] Specify validation, canonicalization, duplicate and missing-project results.
- [ ] Build the private repository snapshot and audit event from server context.
- [ ] Export provider-neutral contracts.

## Task 2: SQLite registration repository

- [ ] Validate project existence inside an immediate transaction.
- [ ] Reject case-insensitive duplicate full names.
- [ ] Insert the repository and audit event atomically.
- [ ] Specify audit-failure rollback.

## Task 3: Private configuration UI

- [ ] Add active project options to the GitHub operations read model.
- [ ] Add owner/CSRF-protected POST server function.
- [ ] Add project, repository, role, default-branch, reason and confirmation controls.
- [ ] Refresh the operations dashboard only after commit.

## Task 4: Documentation and gates

- [ ] Update security, data model, testing, runbook and changelog.
- [ ] Run focused tests/typecheck/build in a dependency-complete environment.
- [ ] Verify registration creates no GitHub network request.
- [ ] Verify anonymous outputs never include the configured target.
