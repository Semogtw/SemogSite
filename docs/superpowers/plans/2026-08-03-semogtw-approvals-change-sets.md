# Semogtw Command Approvals and Change Sets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add immutable, state-bound approval requests and coherent multi-command change sets so high/critical actions cannot execute against unseen or stale state.

**Architecture:** Extend `@semogtw/application` with preview, approval and change-set services. Migration `0019` persists bounded payload/result hashes, resource snapshots, decisions, change-set items and external saga steps. Database-local commands execute in one transaction with receipts/audit; cross-system work uses explicit step/compensation state. Critical approval consumes a recent owner reauthentication proof created by the existing authentication provider.

**Tech Stack:** Node.js 22, TypeScript strict mode, Zod, Vitest, SQLite/Drizzle, existing Command Gateway/agent authorization, `@semogtw/auth`, TanStack Start/Router, React, Playwright.

## Global Constraints

- Implement only after the Command Gateway and agent authorization plans pass.
- Reconcile migration numbering; this plan reserves `0019_command_approvals.sql`.
- Approval is not authorization by itself; capability/resource/switch policy is re-evaluated at execution time.
- Approval payload is immutable and bound to command ID/version, canonical payload hash, resource snapshot hash and expected versions/SHA.
- Stale, expired, rejected, revoked or policy-invalidated approvals never execute.
- High risk may be approved according to owner policy; critical always requires final DevOS approval plus recent authentication.
- Critical recent-auth proof maximum age is **5 minutes** and is single-use per critical approval decision.
- Passwords/credentials are verified through the existing auth provider and never stored in approval records or logs.
- Database-local change sets are all-or-nothing.
- Cross-system work is never falsely reported atomic; it uses ordered saga steps and explicit compensation.
- Change sets contain registered command IDs/inputs only, never SQL, JSON Patch, arbitrary file patches or shell commands.
- Change-set aggregate risk is at least the highest item risk and may escalate for volume/cross-domain/public/security effects.
- Approved payloads cannot be edited in place; editing creates a new draft/version and invalidates the old approval.
- No secret/raw private document/model prompt is stored in ordinary approval previews/logs.
- Owner UI displays before/after effects, reversibility and current staleness.
- Public output remains free of approval/change-set/recent-auth state.
- Commit and push after each independently reviewable task.

---

## Planned file structure

```text
packages/application/src/approvals/
  types.ts
  preview.ts
  preview.test.ts
  approval-service.ts
  approval-service.test.ts
  staleness.ts
  staleness.test.ts
  recent-auth.ts
  recent-auth.test.ts

packages/application/src/change-sets/
  types.ts
  risk.ts
  risk.test.ts
  validation.ts
  validation.test.ts
  service.ts
  service.test.ts
  saga.ts
  saga.test.ts

packages/database/
  migrations/0019_command_approvals.sql
  src/schema/command-approvals.ts
  src/repositories/command-approval-repository.ts
  src/repositories/command-approval-repository.test.ts
  src/repositories/change-set-repository.ts
  src/repositories/change-set-repository.test.ts
  src/repositories/recent-auth-proof-repository.ts
  src/repositories/recent-auth-proof-repository.test.ts
  src/repositories/command-saga-repository.ts
  src/repositories/command-saga-repository.test.ts
  src/composition/approval-command-policy.ts
  src/composition/approved-command-executor.ts
  src/composition/approved-command-executor.test.ts
  src/composition/change-set-executor.ts
  src/composition/change-set-executor.test.ts

packages/auth/src/
  recent-auth-service.ts
  recent-auth-service.test.ts

apps/web/src/server/
  devos-recent-auth.ts
  devos-recent-auth.test.ts
  devos-approvals.ts
  devos-approvals.test.ts
  devos-change-sets.ts
  devos-change-sets.test.ts

apps/web/src/routes/
  devos.approvals.tsx
  devos.approvals.index.tsx
  devos.approvals.$approvalId.tsx
  devos.change-sets.tsx
  devos.change-sets.index.tsx
  devos.change-sets.$changeSetId.tsx

apps/web/src/components/devos/
  command-preview.tsx
  approval-decision-form.tsx
  recent-auth-form.tsx
  change-set-builder.tsx
  change-set-item-list.tsx
  saga-progress.tsx

apps/web/src/styles/
  approvals.css

tests/e2e/
  command-approvals-change-sets.spec.ts

docs/testing/
  2026-08-03-command-approvals-change-sets-test-matrix.md
```

---

### Task 1: Reconcile prerequisites, risk inventory and migration reservation

**Files:**
- Create: `docs/testing/2026-08-03-command-approvals-change-sets-test-matrix.md`
- Modify: `docs/architecture/EDITABILITY_COVERAGE.md`
- Modify: `docs/superpowers/plans/2026-08-03-semogtw-agent-editability-plan-stack.md`

**Interfaces:**
- Consumes: registered command catalog, risk floors, resource snapshots, idempotency receipts, effective agent policy and current auth provider/session contracts.
- Produces: exact base SHA, selected pilot commands and confirmed migration number.

- [ ] **Step 1: Inspect the current implementation**

```bash
git fetch --all --prune
git status --short --branch
git rev-parse HEAD
ls packages/database/migrations | sort
rg -n "staticRiskFloor: (\"high\"|\"critical\")|prepare_approval|approve_in_devos" packages/application packages/database apps
rg -n "AuthProvider|authenticate|resolveSession|password" packages/auth apps/web/src/server
```

- [ ] **Step 2: Select pilot approval scenarios**

Use:

```text
roadmap.stages.complete     high
agent remote global enable critical
```

If the exact critical command is not registered yet, register `integrations.remote_writes.enable_global` in the agent-authorization implementation before proceeding. Do not create a test-only production command.

- [ ] **Step 3: Verify migration 0019 is free**

```bash
rg -n "0019_command_approvals|0019_" packages/database/migrations docs/superpowers
```

- [ ] **Step 4: Run prerequisite gates**

```bash
pnpm check:editability-coverage
pnpm --filter @semogtw/application test
pnpm --filter @semogtw/auth test
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/web test
```

Record exact results and block implementation if command authorization/idempotency is not green.

- [ ] **Step 5: Commit**

```bash
git add docs/testing/2026-08-03-command-approvals-change-sets-test-matrix.md \
  docs/architecture/EDITABILITY_COVERAGE.md \
  docs/superpowers/plans/2026-08-03-semogtw-agent-editability-plan-stack.md
git commit -m "docs: establish command approval baseline"
git push
```

---

### Task 2: Define bounded previews and resource snapshots

**Files:**
- Create: `packages/application/src/approvals/types.ts`
- Create: `packages/application/src/approvals/preview.ts`
- Create: `packages/application/src/approvals/preview.test.ts`
- Modify: `packages/application/src/index.ts`

**Interfaces:**

```ts
export type ApprovalResourceSnapshot = {
  resource: CommandResource;
  expectedState: CommandExpectedState;
  snapshotSha256: string;
  displayLabel: string;
};

export type CommandEffectPreview = {
  commandId: string;
  commandVersion: number;
  risk: "high" | "critical";
  summaryPtBr: string;
  reversible: boolean;
  before: readonly PreviewField[];
  after: readonly PreviewField[];
  derivedEffects: readonly string[];
  resources: readonly ApprovalResourceSnapshot[];
  payloadSha256: string;
  resourceSnapshotSha256: string;
};

export type PreviewField = {
  key: string;
  labelPtBr: string;
  value: string | number | boolean | null;
  sensitive: false;
};

export interface CommandPreviewProvider<Input = unknown> {
  commandId: string;
  preview(input: {
    parsedInput: Input;
    principal: CommandPrincipal;
  }): Promise<CommandEffectPreview>;
}

export function validateCommandEffectPreview(
  preview: CommandEffectPreview,
): CommandEffectPreview;
```

Bounds:

```text
summary: 1..500 chars
before fields: max 100
after fields: max 100
derived effects: max 50, each max 300 chars
resources: max 100
serialized preview: max 128 KiB
sensitive field: impossible in this DTO
```

- [ ] **Step 1: Write failing preview tests**

Test deterministic hashes, stable ordering, oversized rejection, secret-key rejection (`token`, `secret`, `password`, `authorization`, `cookie`), resource expected-state binding and no arbitrary object values.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/application exec vitest run src/approvals/preview.test.ts
```

- [ ] **Step 3: Implement validation/hashing**

Reuse canonical JSON from the Command Gateway plan. Hash the exact allowlisted preview/resource arrays.

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/application exec vitest run src/approvals/preview.test.ts
pnpm --filter @semogtw/application typecheck
git add packages/application/src
git commit -m "feat: define bounded command previews"
git push
```

---

### Task 3: Add migration 0019 for approvals, change sets, sagas and recent auth

**Files:**
- Create: `packages/database/migrations/0019_command_approvals.sql`
- Create: `packages/database/src/schema/command-approvals.ts`
- Modify: `packages/database/src/schema/index.ts`
- Modify: `packages/database/src/index.ts`
- Create: migration tests.
- Modify: backup/restore tests.

**Tables:**

```text
command_approval_requests
command_approval_resources
command_change_sets
command_change_set_items
command_saga_steps
owner_recent_auth_proofs
command_approval_events
```

Approval request states:

```text
pending
approved
rejected
expired
stale
executing
executed
failed
```

Change-set states:

```text
draft
validating
invalid
ready
confirmation_required
approval_required
approved
applying
applied
stale
rejected
failed
compensating
compensated
```

Required approval columns:

```text
id
owner_id
principal_kind
client_id nullable
command_id/version
risk high|critical
payload_sha256
resource_snapshot_sha256
preview_json bounded
reason
status
expires_at
created_at
decided_at/decided_by nullable
recent_auth_proof_id nullable
executed_receipt_id nullable
version
```

Required constraints:

- critical approval cannot become approved without `recent_auth_proof_id`;
- `preview_json` and change-set item input JSON are bounded at repository layer;
- approved payload hashes are immutable;
- resource snapshots are normalized child rows, not trusted from a later request;
- owner recent-auth proof stores session ID/reference, verified/expiry/consumed timestamps only;
- no password/hash/provider token is stored;
- saga step uniqueness on `(change_set_id, sequence)`;
- no cascade deletes erase approval/saga history.

- [ ] **Step 1: Write failing migration tests**

Test checks/FKs/indexes, no secret/password columns, status constraints, critical proof requirement, append-only events and migration reapplication.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/database exec vitest run src/command-approvals-migrations.test.ts src/adapters/sqlite-migrations.test.ts
```

- [ ] **Step 3: Implement migration/schema**

Use UTC ISO timestamps and integer optimistic versions.

- [ ] **Step 4: Extend backup/restore**

Prove approval/change-set/history/recent-auth metadata survives restore without credential material.

- [ ] **Step 5: Run and commit**

```bash
pnpm --filter @semogtw/database exec vitest run \
  src/command-approvals-migrations.test.ts \
  src/adapters/sqlite-migrations.test.ts \
  src/backup/sqlite-backup.test.ts
pnpm --filter @semogtw/database typecheck
git add packages/database
git commit -m "feat: add command approval persistence"
git push
```

---

### Task 4: Implement single-use recent owner authentication

**Files:**
- Create: `packages/application/src/approvals/recent-auth.ts`
- Create: `packages/application/src/approvals/recent-auth.test.ts`
- Create: `packages/auth/src/recent-auth-service.ts`
- Create: `packages/auth/src/recent-auth-service.test.ts`
- Create: `packages/database/src/repositories/recent-auth-proof-repository.ts`
- Create: `packages/database/src/repositories/recent-auth-proof-repository.test.ts`
- Modify: package indexes.

**Interfaces:**

```ts
export type RecentAuthProof = {
  id: string;
  ownerId: string;
  sessionId: string;
  verifiedAt: string;
  expiresAt: string;
  consumedAt: string | null;
};

export interface RecentAuthService {
  verifyAndIssue(input: {
    ownerId: string;
    sessionId: string;
    password: string;
    now: string;
  }): Promise<{ proofId: string; expiresAt: string } | null>;
  consume(input: {
    proofId: string;
    ownerId: string;
    sessionId: string;
    now: string;
  }): Promise<boolean>;
}
```

Fixed rules:

```text
TTL: 5 minutes
single use: yes
same owner/session: required
password: passed directly to existing AuthProvider and discarded
failed verification: generic result and existing auth rate limiting
```

- [ ] **Step 1: Write failing pure tests**

Test exact expiry boundary and consumed/owner/session mismatch.

- [ ] **Step 2: Write failing auth tests**

Use a fake AuthProvider proving password is not sent to repository/log output and proof is issued only after successful reauthentication.

- [ ] **Step 3: Write failing repository tests**

Test atomic consume, concurrent consume one success, expired rejection and session revocation invalidating proofs.

- [ ] **Step 4: Run and verify failure**

```bash
pnpm --filter @semogtw/application exec vitest run src/approvals/recent-auth.test.ts
pnpm --filter @semogtw/auth exec vitest run src/recent-auth-service.test.ts
pnpm --filter @semogtw/database exec vitest run src/repositories/recent-auth-proof-repository.test.ts
```

- [ ] **Step 5: Implement and run**

```bash
pnpm --filter @semogtw/application test
pnpm --filter @semogtw/auth test
pnpm --filter @semogtw/database test -- recent-auth-proof-repository.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add packages/application/src packages/auth/src packages/database/src
git commit -m "feat: add single-use recent owner authentication"
git push
```

---

### Task 5: Implement immutable approval request repository

**Files:**
- Create: `packages/database/src/repositories/command-approval-repository.ts`
- Create: `packages/database/src/repositories/command-approval-repository.test.ts`
- Modify: `packages/database/src/index.ts`

**Interfaces:**

```ts
export interface CommandApprovalRepository {
  create(input: CreateCommandApprovalRecord): CommandApprovalRecord;
  findForOwner(input: {
    ownerId: string;
    approvalId: string;
  }): CommandApprovalRecord | null;
  listPending(input: {
    ownerId: string;
    limit: number;
    cursor: string | null;
  }): PaginatedCommandApprovalRecords;
  approveHigh(input: ApproveHighRiskRecord): boolean;
  approveCritical(input: ApproveCriticalRiskRecord): boolean;
  reject(input: RejectApprovalRecord): boolean;
  markStale(input: MarkApprovalStaleRecord): boolean;
  beginExecution(input: BeginApprovalExecutionRecord): boolean;
  completeExecution(input: CompleteApprovalExecutionRecord): boolean;
  failExecution(input: FailApprovalExecutionRecord): boolean;
}
```

Rules:

- create request + resources + event atomically;
- request payload/preview fields cannot be updated after insert;
- only status/version/decision/execution linkage may change through explicit methods;
- approve critical consumes recent-auth proof in the same transaction;
- expired/revoked client/grant cannot approve/execute;
- reject/stale is terminal for execution;
- execution starts once;
- no hard delete API.

- [ ] **Step 1: Write failing repository tests**

Cover immutability, high approval, critical proof consume, expiry, optimistic decision conflict, stale/rejected execution denial, one execution, event append and pagination isolation by owner.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/database exec vitest run src/repositories/command-approval-repository.test.ts
```

- [ ] **Step 3: Implement repository**

Use immediate transactions for decision/execution transitions.

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/database exec vitest run src/repositories/command-approval-repository.test.ts
pnpm --filter @semogtw/database typecheck
git add packages/database/src
git commit -m "feat: add immutable command approval repository"
git push
```

---

### Task 6: Implement approval service and staleness evaluation

**Files:**
- Create: `packages/application/src/approvals/approval-service.ts`
- Create: `packages/application/src/approvals/approval-service.test.ts`
- Create: `packages/application/src/approvals/staleness.ts`
- Create: `packages/application/src/approvals/staleness.test.ts`
- Modify: `packages/application/src/index.ts`

**Interfaces:**

```ts
export type ApprovalStalenessInput = {
  approvedCommandId: string;
  approvedCommandVersion: number;
  currentCommandVersion: number | null;
  approvedPayloadSha256: string;
  currentPayloadSha256: string;
  approvedResourceSnapshotSha256: string;
  currentResourceSnapshotSha256: string;
  clientActive: boolean;
  grantStillAuthorizes: boolean;
  policyRisk: CommandRisk;
  approvedRisk: "high" | "critical";
  now: string;
  expiresAt: string;
};

export function evaluateApprovalStaleness(
  input: ApprovalStalenessInput,
): { stale: boolean; code: string | null };

export interface CommandApprovalService {
  prepare(input: PreparedHighOrCriticalCommand): Promise<{
    status: "approval_required";
    approvalId: string;
    reviewPath: string;
  }>;
  approveHigh(input: OwnerHighApprovalInput): Promise<ApprovalDecisionResult>;
  approveCritical(
    input: OwnerCriticalApprovalInput & { recentAuthProofId: string },
  ): Promise<ApprovalDecisionResult>;
  reject(input: OwnerRejectionInput): Promise<ApprovalDecisionResult>;
}
```

Staleness priority:

```text
expired
command_removed_or_version_changed
payload_changed
resource_changed
client_revoked
permission_changed
risk_increased
```

Risk decrease does not revive a stale/expired request.

- [ ] **Step 1: Write table-driven staleness tests**

Cover every reason and stable priority.

- [ ] **Step 2: Write approval service tests**

Test bounded preview, reason, high/critical paths, recent-auth requirement, no client self-approval, immutable payload and review path.

- [ ] **Step 3: Run and verify failure**

```bash
pnpm --filter @semogtw/application exec vitest run src/approvals/staleness.test.ts src/approvals/approval-service.test.ts
```

- [ ] **Step 4: Implement pure/service logic**

The service never executes a command directly; it creates/decides requests only.

- [ ] **Step 5: Run and commit**

```bash
pnpm --filter @semogtw/application exec vitest run src/approvals/staleness.test.ts src/approvals/approval-service.test.ts
pnpm --filter @semogtw/application typecheck
git add packages/application/src
git commit -m "feat: add state-bound command approval service"
git push
```

---

### Task 7: Execute approved commands with full revalidation

**Files:**
- Create: `packages/database/src/composition/approval-command-policy.ts`
- Create: `packages/database/src/composition/approved-command-executor.ts`
- Create: `packages/database/src/composition/approved-command-executor.test.ts`
- Modify: `packages/database/src/composition/devos-command-gateway.ts`
- Modify: indexes.

**Interfaces:**

```ts
export interface ApprovedCommandExecutor {
  execute(input: {
    approvalId: string;
    principal: CommandPrincipal;
    correlationId: string;
    now: string;
  }): Promise<CommandGatewayResult>;
}
```

Execution sequence:

```text
1. load approval for owner/client
2. load current command definition
3. reconstruct canonical input from immutable approval record
4. recompute payload/resource snapshots and current risk
5. re-evaluate client/grants/switches/policy
6. mark stale and stop on any mismatch
7. atomically begin approval execution
8. run canonical command through Command Gateway/idempotency receipt
9. atomically link receipt/result and mark executed/failed
```

The approval ID is not an idempotency key. The immutable request has its own execution idempotency key stored at preparation time.

- [ ] **Step 1: Write failing integration tests**

Prove high approved execution, critical proof path, stale entity version, changed command version, revoked client/grant, switch disable, one execution, command rollback and no second audit/receipt.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/database exec vitest run src/composition/approved-command-executor.test.ts
```

- [ ] **Step 3: Implement composition**

Do not trust preview values as execution state; always reload current canonical state.

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/database exec vitest run src/composition/approved-command-executor.test.ts
pnpm --filter @semogtw/database typecheck
git add packages/database/src
git commit -m "feat: execute approved commands with revalidation"
git push
```

---

### Task 8: Define change-set validation and aggregate risk

**Files:**
- Create: `packages/application/src/change-sets/types.ts`
- Create: `packages/application/src/change-sets/risk.ts`
- Create: `packages/application/src/change-sets/risk.test.ts`
- Create: `packages/application/src/change-sets/validation.ts`
- Create: `packages/application/src/change-sets/validation.test.ts`
- Modify: `packages/application/src/index.ts`

**Interfaces:**

```ts
export type DraftChangeSetItem = {
  itemId: string;
  sequence: number;
  commandId: string;
  commandVersion: number;
  input: unknown;
  expectedState: CommandExpectedState;
};

export type ValidatedChangeSet = {
  items: readonly PreparedCommand[];
  risk: CommandRisk;
  atomicity: "database_transaction" | "external_saga";
  payloadSha256: string;
  resourceSnapshotSha256: string;
  summaryPtBr: string;
};

export function classifyChangeSetRisk(input: {
  itemRisks: readonly CommandRisk[];
  itemCount: number;
  domains: readonly string[];
  includesPublicEffect: boolean;
  includesSecurityEffect: boolean;
  includesExternalEffect: boolean;
}): CommandRisk;

export function validateChangeSet(input: {
  items: readonly DraftChangeSetItem[];
  registry: CommandRegistry;
  principal: CommandPrincipal;
}): Promise<ValidatedChangeSet>;
```

Fixed bounds:

```text
items: 1..50
database-atomic domains: commands sharing the SQLite transaction boundary
cross-system/external effect: external_saga
security effect: critical
public effect: at least high
more than 20 items: at least high
multiple domains: may escalate one level, capped at critical
```

- [ ] **Step 1: Write failing risk tests**

Test max risk, item-count escalation, public/security/external and deterministic domain ordering.

- [ ] **Step 2: Write failing validation tests**

Test unknown/version mismatch, duplicate item/sequence, invalid input, unauthorized resource, mixed atomicity, payload hash and bounded summary.

- [ ] **Step 3: Run and verify failure**

```bash
pnpm --filter @semogtw/application exec vitest run src/change-sets/risk.test.ts src/change-sets/validation.test.ts
```

- [ ] **Step 4: Implement and commit**

```bash
pnpm --filter @semogtw/application exec vitest run src/change-sets/risk.test.ts src/change-sets/validation.test.ts
pnpm --filter @semogtw/application typecheck
git add packages/application/src
git commit -m "feat: validate command change sets"
git push
```

---

### Task 9: Implement change-set and saga repositories

**Files:**
- Create: `packages/database/src/repositories/change-set-repository.ts`
- Create: `packages/database/src/repositories/change-set-repository.test.ts`
- Create: `packages/database/src/repositories/command-saga-repository.ts`
- Create: `packages/database/src/repositories/command-saga-repository.test.ts`
- Modify: `packages/database/src/index.ts`

**Interfaces:**

```ts
export interface ChangeSetRepository {
  createDraft(input: CreateChangeSetRecord): ChangeSetRecord;
  replaceDraftItems(input: ReplaceDraftItemsRecord): ChangeSetRecord | null;
  storeValidation(input: StoreChangeSetValidationRecord): boolean;
  attachApproval(input: AttachChangeSetApprovalRecord): boolean;
  beginApply(input: BeginChangeSetApplyRecord): boolean;
  completeApply(input: CompleteChangeSetApplyRecord): boolean;
  markStale(input: MarkChangeSetStaleRecord): boolean;
  fail(input: FailChangeSetRecord): boolean;
}

export interface CommandSagaRepository {
  createSteps(input: CreateSagaStepsRecord): readonly SagaStepRecord[];
  beginStep(input: BeginSagaStepRecord): boolean;
  completeStep(input: CompleteSagaStepRecord): boolean;
  failStep(input: FailSagaStepRecord): boolean;
  beginCompensation(input: BeginCompensationRecord): boolean;
  completeCompensation(input: CompleteCompensationRecord): boolean;
  failCompensation(input: FailCompensationRecord): boolean;
}
```

Rules:

- only draft items can be replaced;
- validation freezes item command/version/input hashes;
- approved/applied item payloads are immutable;
- saga sequence is fixed and append-only after validation;
- external result references are bounded IDs/URLs without credentials;
- partial success remains explicit.

- [ ] **Step 1: Write failing repository tests**

Cover draft edit, validation freeze, approval link, one apply, stale, database rollback, saga step state machine and compensation failure.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/database exec vitest run src/repositories/change-set-repository.test.ts src/repositories/command-saga-repository.test.ts
```

- [ ] **Step 3: Implement and commit**

```bash
pnpm --filter @semogtw/database exec vitest run src/repositories/change-set-repository.test.ts src/repositories/command-saga-repository.test.ts
pnpm --filter @semogtw/database typecheck
git add packages/database/src
git commit -m "feat: add change-set and saga repositories"
git push
```

---

### Task 10: Apply database-local change sets atomically

**Files:**
- Create: `packages/application/src/change-sets/service.ts`
- Create: `packages/application/src/change-sets/service.test.ts`
- Create: `packages/database/src/composition/change-set-executor.ts`
- Create: `packages/database/src/composition/change-set-executor.test.ts`
- Modify: indexes.

**Interfaces:**

```ts
export interface ChangeSetService {
  createDraft(input: CreateDraftChangeSetInput): Promise<ChangeSetSummary>;
  validate(input: ValidateChangeSetInput): Promise<ChangeSetSummary>;
  requestApproval(input: RequestChangeSetApprovalInput): Promise<{
    approvalId: string;
    reviewPath: string;
  }>;
  apply(input: ApplyChangeSetInput): Promise<ChangeSetApplyResult>;
}
```

Database-transaction apply sequence:

```text
1. reload frozen set/items
2. revalidate commands/versions/resources/risk/policy
3. verify approval/confirmation and hashes
4. begin set apply
5. claim one receipt per item using set/item-derived idempotency keys
6. execute all commands on the same transaction-bound registry
7. finalize every receipt/audit/domain mutation
8. mark set applied
9. commit once
```

One item failure rolls back every item/receipt/domain audit and leaves the set in a retry-safe failed/stale state recorded outside or in a controlled follow-up transaction.

- [ ] **Step 1: Write failing service tests**

Test draft→validate→approval, editing invalidates validation, wrong principal, high/critical decision and no direct apply from draft.

- [ ] **Step 2: Write failing executor tests**

Use two registered database-local pilot commands. Prove success, second-item rollback, replay, stale target, changed command version and one set-level audit/event.

- [ ] **Step 3: Run and verify failure**

```bash
pnpm --filter @semogtw/application exec vitest run src/change-sets/service.test.ts
pnpm --filter @semogtw/database exec vitest run src/composition/change-set-executor.test.ts
```

- [ ] **Step 4: Implement and run**

```bash
pnpm --filter @semogtw/application test
pnpm --filter @semogtw/database exec vitest run src/composition/change-set-executor.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add packages/application/src packages/database/src
git commit -m "feat: apply database command change sets atomically"
git push
```

---

### Task 11: Implement external saga execution and compensation semantics

**Files:**
- Create: `packages/application/src/change-sets/saga.ts`
- Create: `packages/application/src/change-sets/saga.test.ts`
- Modify: `packages/database/src/composition/change-set-executor.ts`
- Modify: focused tests.

**Interfaces:**

```ts
export type ExternalCommandStep = {
  itemId: string;
  execute(): Promise<{ resultRef: string }>;
  compensate?: (resultRef: string) => Promise<{ compensationRef: string }>;
};

export interface CommandSagaExecutor {
  execute(input: {
    changeSetId: string;
    steps: readonly ExternalCommandStep[];
    correlationId: string;
  }): Promise<{
    status: "applied" | "failed" | "compensated" | "compensation_failed";
    completedItemIds: readonly string[];
    failedItemId: string | null;
  }>;
}
```

Rules:

- exact step order from validated set;
- each step transition persisted before/after side effect;
- retries use stored result refs/idempotency contracts;
- compensation runs reverse order only for completed compensatable steps;
- no claim of full rollback when compensation is unavailable/failed;
- critical external actions still require approval before first step.

- [ ] **Step 1: Write failing saga tests**

Test all success, second-step failure with successful compensation, non-compensatable partial success, compensation failure, restart/resume and duplicate invocation.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/application exec vitest run src/change-sets/saga.test.ts
pnpm --filter @semogtw/database exec vitest run src/repositories/command-saga-repository.test.ts
```

- [ ] **Step 3: Implement orchestration using repository state**

No external adapter is introduced in this task; tests use injected deterministic fakes.

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/application exec vitest run src/change-sets/saga.test.ts
pnpm --filter @semogtw/database test -- command-saga-repository.test.ts
git add packages/application/src packages/database/src
git commit -m "feat: add explicit command saga compensation"
git push
```

---

### Task 12: Build owner approval, recent-auth and change-set UI

**Files:**
- Create: server/route/component/style files from planned structure.
- Modify: `apps/web/src/components/devos/devos-shell.tsx` and navigation.
- Modify: registered owner-browser command adapters for approval decisions.

**Owner experience:**

Approval detail shows:

```text
Who/client requested it
Command and human action name
Risk and why
Reason
Created/expiry
Before/after fields
Derived effects
Affected resources and expected versions/SHA
Reversibility
Current stale/valid state
Approve / Reject / Edit as new request
```

Critical approval flow:

```text
Click Approve
→ password reauthentication form
→ server verifies and issues 5-minute single-use proof
→ same decision request consumes proof
→ approval becomes approved
→ command execution occurs or is explicitly queued
```

Change-set UI uses ordered cards, not a spreadsheet. Advanced technical view may show command IDs/hashes/resource versions.

- [ ] **Step 1: Write failing server tests**

Test owner auth/CSRF, recent auth, high/critical decision, rejection, stale display, no password persistence, execution linkage and edit-as-new.

- [ ] **Step 2: Write failing component tests**

Test accessible preview, risk/reversibility text, password field autocomplete/current-password behavior, stale disabling, mobile card layout and no raw secret/body output.

- [ ] **Step 3: Run and verify failure**

```bash
pnpm --filter @semogtw/web exec vitest run \
  src/server/devos-recent-auth.test.ts \
  src/server/devos-approvals.test.ts \
  src/server/devos-change-sets.test.ts
```

- [ ] **Step 4: Implement server handlers via canonical commands**

Approval administration commands are high/critical and must not create circular self-approval. Emergency reject/revoke/disable paths remain independently owner-authenticated/audited.

- [ ] **Step 5: Implement routes/components/styles**

Use progressive disclosure and exact Portuguese copy. Do not show `Aprovado` until persisted decision succeeds.

- [ ] **Step 6: Run and commit**

```bash
pnpm --filter @semogtw/web test
pnpm --filter @semogtw/web typecheck
git add apps/web/src
git commit -m "feat: add DevOS approvals and change sets"
git push
```

---

### Task 13: Migrate high-risk stage completion through approval

**Files:**
- Modify: `apps/web/src/server/devos-stage-completion.ts`
- Modify: `apps/web/src/components/devos/stage-completion-form.tsx`
- Modify: `packages/application/src/roadmap/complete-stage-command.ts`
- Modify: focused domain/application/database/web tests.
- Modify: `docs/architecture/EDITABILITY_COVERAGE.md`

**Flow:**

```text
Owner submits completion evidence/reason
→ gateway computes high risk
→ command preview is created
→ approval request appears
→ owner reviews/approves
→ executor revalidates stage/evidence/version
→ command executes once
```

- [ ] **Step 1: Write failing integrated tests**

Prove no completion before approval, changed evidence/stage becomes stale, approved execution creates one completion/audit/receipt and replay returns original result.

- [ ] **Step 2: Implement preview provider**

Allowlisted preview fields:

```text
stage title
current status/progress
proposed completed status/progress
selected evidence references (bounded labels/IDs)
project progress derived effect
reversibility/compensation statement
```

- [ ] **Step 3: Migrate browser handler/UI**

Return `approval_required` with review path instead of executing directly.

- [ ] **Step 4: Run focused gates**

```bash
pnpm --filter @semogtw/application test -- complete-stage-command
pnpm --filter @semogtw/database test -- approved-command-executor
pnpm --filter @semogtw/web test -- devos-stage-completion
```

- [ ] **Step 5: Commit**

```bash
git add packages/application/src/roadmap apps/web/src packages/database/src \
  docs/architecture/EDITABILITY_COVERAGE.md
git commit -m "feat: require approval for stage completion"
git push
```

---

### Task 14: Verify approvals, staleness, atomicity and critical recent auth E2E

**Files:**
- Create: `tests/e2e/command-approvals-change-sets.spec.ts`
- Modify: `docs/testing/2026-08-03-command-approvals-change-sets-test-matrix.md`
- Modify: architecture/data/security/runbook/changelog docs.

**E2E scenarios:**

1. request high-risk stage completion and verify no mutation;
2. approve and execute; verify one receipt/audit;
3. request again, change target state, verify stale/disabled approval;
4. prepare two-item database-local change set and apply atomically;
5. force second item failure and verify zero item mutations/receipts;
6. request global remote-write enable (critical);
7. attempt approval without recent auth and fail;
8. enter wrong password and fail generically/rate-limited;
9. authenticate correctly and approve once within five minutes;
10. replay proof/approval and fail;
11. disable global writes and verify reads continue;
12. inspect 360 px approval/change-set views;
13. verify public pages/assets contain no approval IDs/previews/recent-auth/change-set data.

- [ ] **Step 1: Implement E2E and deterministic fixtures**

Use test-only owner credentials from the existing secure test configuration, never repository literals used outside tests.

- [ ] **Step 2: Run focused/full gates**

```bash
pnpm check:editability-coverage
pnpm check:public-confidentiality
pnpm --filter @semogtw/application test
pnpm --filter @semogtw/auth test
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/web test
pnpm --filter @semogtw/web typecheck
pnpm --filter @semogtw/web build
pnpm exec playwright test tests/e2e/command-approvals-change-sets.spec.ts
pnpm check
pnpm build
```

- [ ] **Step 3: Scan logs/build/artifacts**

```bash
rg -n "password|authorization|cookie|client_secret|access_token|refresh_token|rawPayload|preview_json" \
  apps/*/dist test-results playwright-report logs
```

Expected: no credential/raw private payload values.

- [ ] **Step 4: Update docs by reference**

Document observed routes/tables/TTL/state machines/runbook and link to the canonical unified specification. Do not repeat the full design.

- [ ] **Step 5: Commit closeout**

```bash
git add tests/e2e/command-approvals-change-sets.spec.ts \
  docs/testing/2026-08-03-command-approvals-change-sets-test-matrix.md \
  docs/ARCHITECTURE.md docs/DATA_MODEL.md SECURITY.md RUNBOOK.md CHANGELOG.md
git commit -m "test: verify command approvals and change sets"
git push
```

## Acceptance criteria

This plan is complete only when:

- previews are bounded, allowlisted and deterministic;
- approvals are immutable and hash/version/SHA bound;
- every execution revalidates current command, resource, permission, policy and switches;
- stale/expired/revoked/rejected requests fail closed;
- critical approval requires a single-use recent-auth proof no older than five minutes;
- passwords never enter approval persistence/logs;
- database-local change sets are atomic;
- external sagas represent partial/compensation states honestly;
- approved payload editing creates a new request;
- high-risk stage completion is migrated through approval;
- owner UI explains effects/risk/reversibility and works at 360 px;
- public confidentiality, idempotency, rollback, auth and full gates pass.
