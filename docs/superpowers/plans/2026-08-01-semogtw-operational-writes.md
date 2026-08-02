# Semogtw Operational Writes, Evidence, Audit, and Backup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the smallest safe operational-write layer for Semogtw DevOS before any MCP write tools are exposed.

**Architecture:** Every mutation is validated in `packages/domain`, persisted through a host-independent repository port, authorized server-side, protected by CSRF where browser initiated, and coupled to an append-only audit event in the same transaction. SQLite remains the canonical local adapter; backup exports are private, explicit, and verifiable.

**Tech Stack:** TypeScript strict mode, Vitest, Drizzle ORM, SQLite through `better-sqlite3`, TanStack Start server functions, Zod, React.

## Global Constraints

- Product identity is **Semogtw** and the private application is **Semogtw DevOS**.
- UI language is Brazilian Portuguese and presentation timezone is `America/Bahia`.
- `/devos` and all operational write handlers fail closed without owner authentication.
- Browser mutations require the existing session-bound CSRF token.
- Every sensitive write requires a reason and explicit confirmation.
- Audit insertion and entity mutation occur in the same database transaction.
- Optimistic conflicts return a conflict result and must not create audit records.
- Public DTOs, anonymous HTML and public APIs never include operational records or audit data.
- Historical migrations are immutable; schema changes use new migrations.
- Tests are not marked passed without observed output.
- Commit and push after each independently reviewable unit.

---

## Task 1: Confirmed attention capture

**Files:**
- Modify: `packages/domain/src/capture/capture-service.ts`
- Test: `packages/domain/src/capture/capture-service.test.ts`
- Modify: `packages/database/src/repositories/attention-capture-repository.ts`
- Test: `packages/database/src/repositories/attention-capture-repository.test.ts`
- Modify: `apps/web/src/server/devos-capture.ts`
- Modify: `apps/web/src/routes/devos.capture.tsx`

**Interfaces:**
- Produces: `AttentionCaptureService.capture(input, context)`
- Produces: `AttentionCaptureRepository.insertAttentionWithAudit(attention, audit)`

- [x] **Step 1: Specify validation, normalization and audit output in domain tests**
- [x] **Step 2: Implement confirmed capture and assign external dependencies/tests to `external_environment`**
- [x] **Step 3: Specify canonical SQLite mapping and transaction rollback**
- [x] **Step 4: Map `source → dataSource` and `critical_test → local_test` explicitly**
- [x] **Step 5: Expose a CSRF-protected server function and confirmed form**
- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm --filter @semogtw/domain test -- capture-service.test.ts
pnpm --filter @semogtw/database test -- attention-capture-repository.test.ts
pnpm --filter @semogtw/web test
```

Expected: all tests pass and an external capture appears in the external-environment queue.

---

## Task 2: Audited attention lifecycle

**Files:**
- Create: `packages/domain/src/attention/attention-lifecycle-service.ts`
- Test: `packages/domain/src/attention/attention-lifecycle-service.test.ts`
- Create: `packages/database/src/repositories/attention-lifecycle-repository.ts`
- Test: `packages/database/src/repositories/attention-lifecycle-repository.test.ts`
- Create: `apps/web/src/server/devos-attention-lifecycle.ts`
- Modify: `apps/web/src/routes/devos.today.tsx`
- Modify: `apps/web/src/styles/surfaces.css`

**Interfaces:**
- Produces: `AttentionLifecycleService.transition(input, context)`
- Produces: `AttentionLifecycleRepository.findById(id)`
- Produces: `AttentionLifecycleRepository.transitionWithAudit(before, after, audit)`

- [x] **Step 1: Specify final-state protection, validation and conflict behavior**
- [x] **Step 2: Implement domain transitions to `resolved` or `dismissed`**
- [x] **Step 3: Specify persisted type mapping and optimistic update behavior**
- [x] **Step 4: Implement atomic SQLite update plus audit insertion**
- [x] **Step 5: Expose owner-authenticated, CSRF-protected transition handler**
- [x] **Step 6: Add reason/confirmation controls to the Hoje queue**
- [ ] **Step 7: Run focused tests and authenticated browser checks**

Run:

```bash
pnpm --filter @semogtw/domain test -- attention-lifecycle-service.test.ts
pnpm --filter @semogtw/database test -- attention-lifecycle-repository.test.ts
pnpm --filter @semogtw/web test
```

Browser acceptance:

1. capture one owner item and one external item;
2. resolve the owner item with a reason;
3. dismiss the external item with a reason;
4. verify both disappear from active queues;
5. verify two audit rows contain before/after snapshots;
6. verify a stale update returns a conflict and does not add an audit row.

---

## Task 3: Development-session handoff write

**Files:**
- Create: `packages/domain/src/sessions/session-handoff-service.ts`
- Test: `packages/domain/src/sessions/session-handoff-service.test.ts`
- Create: `packages/database/src/repositories/session-handoff-repository.ts`
- Test: `packages/database/src/repositories/session-handoff-repository.test.ts`
- Create: `apps/web/src/server/devos-session-handoff.ts`
- Modify: `apps/web/src/routes/devos.capture.tsx`
- Modify: `packages/domain/src/index.ts`
- Modify: `packages/database/src/index.ts`

**Interfaces:**

```ts
export type RecordSessionHandoffInput = {
  projectId: string | null;
  title: string;
  sessionDate: string;
  actor: string;
  branch: string | null;
  commits: readonly string[];
  completedSummary: string;
  testsStatus: "not_run" | "partial" | "passed" | "failed" | "blocked";
  testsSummary: string;
  blockers: string;
  nextStep: string;
  result: "significant" | "partial" | "maintenance" | "no_change" | "failed";
  reason: string;
  confirmed: boolean;
};
```

- [ ] **Step 1: Write failing domain tests**

Tests must reject missing confirmation, title, completed summary, tests summary and next step. `passed` requires a non-empty tests summary and must never be inferred from commit presence.

- [ ] **Step 2: Implement normalization and audit output**

The service produces a `development_sessions` record with `automatic = false`, `dataSource = "manual"`, normalized unique commit SHAs, and an `audit_events` record with action `development_session.create`.

- [ ] **Step 3: Write failing SQLite transaction tests**

Tests must prove session/audit atomicity and reject duplicate non-null `sourceHash` values without leaving partial data.

- [ ] **Step 4: Implement SQLite repository**

Persist `commitsJson` with `JSON.stringify`, keep blockers as explicit text, and never mark tests passed from free-form wording.

- [ ] **Step 5: Add the server function and capture UI mode**

The browser handler reuses owner auth and CSRF. The form requires explicit confirmation and does not expose session data publicly.

- [ ] **Step 6: Run focused tests and commit**

```bash
pnpm --filter @semogtw/domain test -- session-handoff-service.test.ts
pnpm --filter @semogtw/database test -- session-handoff-repository.test.ts
pnpm --filter @semogtw/web test
```

---

## Task 4: Manual evidence attachment and stage completion guard

**Files:**
- Create: `packages/domain/src/evidence/evidence-service.ts`
- Test: `packages/domain/src/evidence/evidence-service.test.ts`
- Create: `packages/database/src/repositories/evidence-write-repository.ts`
- Test: `packages/database/src/repositories/evidence-write-repository.test.ts`
- Create: `apps/web/src/server/devos-evidence.ts`
- Modify: `apps/web/src/routes/devos.projects.$slug.tsx`

**Interfaces:**
- `EvidenceService.attachManualEvidence(input, context)`
- `EvidenceService.completeStage(input, context)`

- [ ] **Step 1: Specify allowlisted evidence kinds and URL validation**
- [ ] **Step 2: Implement manual evidence attachment with audit**
- [ ] **Step 3: Implement stage completion through existing `validateStage` invariants**
- [ ] **Step 4: Persist evidence, stage and audit atomically**
- [ ] **Step 5: Add private project-hub controls**
- [ ] **Step 6: Run tests and confidentiality scanners**

---

## Task 5: Private backup export and restore verification

**Files:**
- Create: `packages/database/src/backup/sqlite-backup.ts`
- Test: `packages/database/src/backup/sqlite-backup.test.ts`
- Create: `scripts/backup-database.mjs`
- Create: `scripts/verify-backup.mjs`
- Modify: `RUNBOOK.md`
- Modify: `SECURITY.md`

- [ ] **Step 1: Specify a consistent SQLite backup snapshot**
- [ ] **Step 2: Implement backup to an owner-selected local path**
- [ ] **Step 3: Implement integrity verification with `PRAGMA integrity_check`**
- [ ] **Step 4: Verify restore into a temporary database and compare migration state**
- [ ] **Step 5: Document encryption/storage responsibility and retention**
- [ ] **Step 6: Run backup/restore test and commit**

No backup is uploaded automatically and no secret is embedded in the repository.

---

## Task 6: Audit review surface and phase closeout

**Files:**
- Create: `packages/database/src/repositories/audit-data-source.ts`
- Test: `packages/database/src/repositories/audit-data-source.test.ts`
- Create: `apps/web/src/server/devos-audit.ts`
- Create: `apps/web/src/routes/devos.audit.tsx`
- Modify: `apps/web/src/components/devos/devos-shell.tsx`
- Modify: `CHANGELOG.md`
- Modify: `DATA_MODEL.md`
- Modify: `SECURITY.md`
- Modify: `RUNBOOK.md`

- [ ] **Step 1: Add paginated private audit reads with filters**
- [ ] **Step 2: Sanitize malformed historical JSON rather than crashing the page**
- [ ] **Step 3: Add protected audit UI with absolute timestamps and correlation IDs**
- [ ] **Step 4: Run `pnpm check`, `pnpm build` and browser confidentiality checks**
- [ ] **Step 5: Update phase documentation and handoff**

## Current execution note

As of 2026-08-01, Tasks 1 and 2 are implemented in code and specified by committed tests. The current runtime cannot resolve `registry.npmjs.org`, so their Vitest/typecheck/build gates remain unexecuted and are documented in `TESTING.md`. The exact next implementation action is Task 3, Step 1.
