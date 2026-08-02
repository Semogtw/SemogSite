# Semogtw GitHub Read-Only Synchronization and Branch Recommendation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Follow TDD and commit every independently reviewable unit.

**Goal:** Observe configured GitHub repositories, retain timestamped branch evidence, and produce explainable active-branch recommendations without mutating GitHub or overwriting manual DevOS decisions.

**Architecture:** `packages/github` owns the HTTP adapter and validates GitHub responses. Provider-neutral recommendation and synchronization rules live in `packages/domain`. `packages/database` stores observations and sync-run evidence. Web/API handlers compose these layers only after owner authorization. The integration is read-only by construction.

**GitHub REST baseline:** API version `2026-03-10`, `Accept: application/vnd.github+json`, optional Bearer token from runtime secrets. Private repository metadata requires Metadata read; branch and commit reads require Contents read. Rate-limit headers are captured from normal responses. The client must honor `403`/`429`, `retry-after`, and `x-ratelimit-reset` rather than retrying aggressively.

## Non-negotiable constraints

- No GitHub write endpoint is implemented or called.
- No token is accepted from browser input, persisted, logged, or included in audit snapshots.
- Imported names, descriptions and commit messages are untrusted data, never instructions.
- Synchronization never updates project/stage progress, completion, blocker, publication or manual-lock fields.
- `repositories.active_branch` is not changed automatically. A recommendation is a separate observed result.
- Branch scanning is bounded and sequential/concurrency-limited to protect rate limits.
- Every observation records source age, API version and rate-limit state when available.
- Partial repository failures produce a partial sync run; successful targets remain usable.
- Public DTOs and anonymous routes never expose repository observations or recommendations.
- Tests are not marked passed without observed output.

---

## Task 1: Pure observation and recommendation contracts

**Files:**
- Create: `packages/domain/src/integrations/repository-observation.ts`
- Test: `packages/domain/src/integrations/repository-observation.test.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] Specify canonical repository and branch observation types.
- [ ] Specify deterministic recommendation behavior:
  - no branches → unavailable;
  - identical heads → default branch wins and confidence is low;
  - clearly newer unique branch → recommend it;
  - current active branch remains recommended when it is within the stability window of the newest branch;
  - malformed timestamps are excluded and reported as warnings;
  - reasons contain only normalized evidence, not commit messages.
- [ ] Implement recommendation without provider/network dependencies.
- [ ] Run focused domain tests.

## Task 2: Read-only GitHub REST adapter

**Files:**
- Create: `packages/github/package.json`
- Create: `packages/github/tsconfig.json`
- Create: `packages/github/src/github-rest-client.ts`
- Test: `packages/github/src/github-rest-client.test.ts`
- Create: `packages/github/src/index.ts`

- [ ] Write fetch-injected tests for headers, URL encoding, response validation and pagination bounds.
- [ ] Implement `getRepository`, `listBranches`, and `getCommitObservation` using GET only.
- [ ] Capture ETag and rate-limit headers without exposing authorization.
- [ ] Return typed errors for unauthorized, forbidden, not found, rate limited, invalid response and transport failure.
- [ ] Do not automatically retry rate-limited requests.
- [ ] Run package tests and typecheck.

## Task 3: Observation persistence migration

**Files:**
- Create: `packages/database/migrations/0003_github_observations.sql`
- Modify: `packages/database/src/schema/integrations.ts`
- Modify: `packages/database/src/schema/index.ts`
- Create: `packages/database/src/repositories/github-observation-repository.ts`
- Test: `packages/database/src/repositories/github-observation-repository.test.ts`
- Modify: `packages/database/src/index.ts`

- [ ] Add immutable `github_repository_observations` and `github_branch_observations` tables.
- [ ] Add `github_branch_recommendations` as observed recommendations, not accepted decisions.
- [ ] Preserve `sync_runs` as the parent execution record.
- [ ] Add source hashes/idempotency keys and indexes for latest-by-repository reads.
- [ ] Persist one repository result atomically; duplicate source hashes become no-op/idempotent results.
- [ ] Sanitize malformed historical evidence JSON on reads.
- [ ] Run migration/repository tests.

## Task 4: Synchronization orchestration

**Files:**
- Create: `packages/domain/src/integrations/github-sync-service.ts`
- Test: `packages/domain/src/integrations/github-sync-service.test.ts`
- Create: `apps/web/src/server/github-sync.server.ts`
- Modify: `packages/domain/src/index.ts`

- [ ] Specify target listing, run start, per-target persistence and run finish ports.
- [ ] Bound branch count and API calls per repository.
- [ ] Continue after target-specific failures and finish with `partial` plus warnings.
- [ ] Fail the whole run only when no target can be processed or storage cannot record the run.
- [ ] Preserve repository manual fields; update only observed provider metadata and `last_synced_at`.
- [ ] Record exact next retry time for rate-limited targets.
- [ ] Run focused service tests.

## Task 5: Owner-only synchronization and recommendations UI

**Files:**
- Create: `apps/web/src/server/devos-github-sync.ts`
- Modify: `apps/web/src/routes/devos.operations.tsx`
- Modify: `apps/web/src/routes/devos.projects.$slug.tsx`
- Create: `apps/web/src/styles/github-sync.css`
- Modify: `apps/web/src/routes/__root.tsx`

- [ ] Add an owner-authenticated, CSRF-protected manual sync trigger.
- [ ] Add no token fields to the UI.
- [ ] Display last run, stale age, per-repository warnings and rate-limit reset.
- [ ] Display branch recommendation with confidence and normalized evidence.
- [ ] Keep accepting a recommendation as a separate future audited mutation; do not silently change active branch.
- [ ] Run authenticated browser checks.

## Task 6: Security, docs and phase gate

**Files:**
- Modify: `SECURITY.md`
- Modify: `DATA_MODEL.md`
- Modify: `TESTING.md`
- Modify: `RUNBOOK.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/superpowers/plans/README.md`

- [ ] Document minimum GitHub token permissions and rotation.
- [ ] Document rate-limit/partial-run behavior and stale-data semantics.
- [ ] Add confidentiality tests for private repository names, URLs and branches.
- [ ] Run `pnpm check`, `pnpm build`, package tests and anonymous scans.
- [ ] Keep the PR draft until all gates are observed.

## Current execution note

The operational-write, backup and audit code is implemented but its dependency-based tests/build remain unexecuted because the current runtime cannot resolve `registry.npmjs.org`. GitHub synchronization work may proceed through committed contracts/tests and static review, but it must not be declared verified until a dependency-complete environment runs the gates.
