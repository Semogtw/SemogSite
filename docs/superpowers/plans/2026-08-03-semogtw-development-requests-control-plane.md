# Semogtw Development Requests Control Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a canonical Development Request lifecycle that turns owner/AI development intent into repository/SHA-bound plans, cooperative scope reservations, checkpoints and exact verification obligations without yet granting an executor raw repository, shell or deployment access.

**Architecture:** Add a framework-free `development` domain that references existing repository targets, workflow scope reservations, verification obligations, recovery snapshots and cooperative run ledger records. Migration `0020` stores requests, revisions, checkpoints, commits, gate evidence and external references. Registered commands use the Command Gateway/approvals stack; DevOS provides task-oriented planning/review UI. Executor dispatch remains disabled until the separate executor plan.

**Tech Stack:** Node.js 22, TypeScript strict mode, Zod, Vitest, SQLite/Drizzle, existing orchestration/run-ledger/Command Gateway packages, TanStack Start/Router, React, Playwright, provider-neutral MCP contracts.

## Global Constraints

- Implement only after Command Gateway, agent authorization and approvals/change sets pass.
- Reconcile migration numbering; this plan reserves `0020_development_requests.sql`.
- Reuse existing repository targets, scope reservations, verification obligations, recovery snapshots and run ledger. Do not create competing concepts/tables for the same responsibility.
- A request is bound to an approved canonical repository target, base branch and exact 40-character base SHA.
- Repository display names/URLs supplied by a caller never create authorization or target registration.
- Code/documentation scope uses normalized repository-relative paths; reject absolute paths, `..`, NUL, backslashes and `.git` internals.
- Scope reservations remain cooperative but conflicts are visible and block automatic start unless an approved override exists.
- A model statement is never verification evidence.
- Gate evidence is bound to an exact 40-character commit SHA, command, environment and observed result.
- `environment`, `quota`, `dependency`, `external_service` and `code_failure` remain distinct classifications.
- Frequent commit/push expectations are recorded as request policy/checkpoints, not falsely observed by DevOS.
- No direct GitHub write, shell execution, dependency install, PR creation, merge, deploy or rollback is introduced by this plan.
- MCP control commands may be registered/discovered only after their write authorization gates pass; no generic executor tool is added.
- Critical auth/security/migration/deployment effects are flagged during planning and require later critical approval.
- Public output contains no private repository, branch, path, request, gate, commit or continuation data.
- Commit and push after each independently reviewable task.

---

## Planned file structure

```text
packages/domain/src/development/
  model.ts
  validation.ts
  validation.test.ts
  lifecycle.ts
  lifecycle.test.ts
  request-service.ts
  request-service.test.ts
  checkpoint-service.ts
  checkpoint-service.test.ts
  verification-evidence.ts
  verification-evidence.test.ts
  index.ts

packages/application/src/development/
  create-development-request-command.ts
  create-development-request-command.test.ts
  update-development-plan-command.ts
  update-development-plan-command.test.ts
  start-development-session-command.ts
  start-development-session-command.test.ts
  record-development-checkpoint-command.ts
  record-development-checkpoint-command.test.ts
  submit-development-review-command.ts
  submit-development-review-command.test.ts
  cancel-development-request-command.ts
  cancel-development-request-command.test.ts
  manifests.ts

packages/database/
  migrations/0020_development_requests.sql
  src/schema/development-requests.ts
  src/repositories/development-request-repository.ts
  src/repositories/development-request-repository.test.ts
  src/repositories/development-checkpoint-repository.ts
  src/repositories/development-checkpoint-repository.test.ts
  src/repositories/development-verification-repository.ts
  src/repositories/development-verification-repository.test.ts
  src/repositories/development-read-model.ts
  src/repositories/development-read-model.test.ts
  src/composition/development-command-registry.ts

packages/mcp/src/
  development-control-tools.ts
  development-control-tools.test.ts

apps/web/src/server/
  devos-development.ts
  devos-development.test.ts

apps/web/src/routes/
  devos.development.tsx
  devos.development.index.tsx
  devos.development.new.tsx
  devos.development.$requestId.tsx

apps/web/src/components/devos/
  development-request-form.tsx
  development-plan-editor.tsx
  development-scope-preview.tsx
  development-checkpoint-timeline.tsx
  development-gate-evidence.tsx
  development-review-summary.tsx

apps/web/src/styles/
  development-control.css

tests/e2e/
  development-requests-control-plane.spec.ts

docs/testing/
  2026-08-03-development-requests-control-plane-test-matrix.md
```

---

### Task 1: Map existing orchestration/run-ledger concepts and reserve migration 0020

**Files:**
- Create: `docs/testing/2026-08-03-development-requests-control-plane-test-matrix.md`
- Create: `docs/architecture/DEVELOPMENT_CONTROL_PLANE.md`
- Modify: `docs/architecture/EDITABILITY_COVERAGE.md`
- Modify: `docs/superpowers/plans/2026-08-03-semogtw-agent-editability-plan-stack.md`

**Interfaces:**
- Consumes: repository target IDs, reservation/obligation/recovery/run-ledger IDs and current database schema.
- Produces: exact ownership map showing which existing subsystem remains canonical.

- [ ] **Step 1: Inspect the newest implementation**

```bash
git fetch --all --prune
git status --short --branch
git rev-parse HEAD
ls packages/database/migrations | sort
find packages/domain/src/orchestration packages/database/src -maxdepth 4 -type f | sort
rg -n "ScopeReservation|VerificationObligation|RecoverySnapshot|RunLedger|RepositoryTarget" packages apps docs
```

- [ ] **Step 2: Write the ownership map**

The document must state:

```text
Repository identity/accepted branch → existing repository target subsystem
Cooperative file/scope lock         → existing scope reservation subsystem
Required exact-SHA gate             → existing verification obligation subsystem
Continuation context                → existing recovery snapshot/resume subsystem
Observed agent/run history           → existing cooperative run ledger
Development intent/lifecycle         → new Development Request subsystem
```

No new plan may duplicate the first five.

- [ ] **Step 3: Verify migration reservation**

```bash
rg -n "0020_development_requests|0020_" packages/database/migrations docs/superpowers
```

- [ ] **Step 4: Run prerequisite gates**

```bash
pnpm check:run-ledger-guardrails
pnpm check:editability-coverage
pnpm --filter @semogtw/domain test
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/application test
```

Record exact results and counts.

- [ ] **Step 5: Commit**

```bash
git add docs/testing/2026-08-03-development-requests-control-plane-test-matrix.md \
  docs/architecture/DEVELOPMENT_CONTROL_PLANE.md \
  docs/architecture/EDITABILITY_COVERAGE.md \
  docs/superpowers/plans/2026-08-03-semogtw-agent-editability-plan-stack.md
git commit -m "docs: map Development Control Plane boundaries"
git push
```

---

### Task 2: Define Development Request model and strict validation

**Files:**
- Create: `packages/domain/src/development/model.ts`
- Create: `packages/domain/src/development/validation.ts`
- Create: `packages/domain/src/development/validation.test.ts`
- Create: `packages/domain/src/development/index.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

```ts
export type DevelopmentRequestStatus =
  | "draft"
  | "planned"
  | "approved_for_development"
  | "in_progress"
  | "verification_blocked"
  | "ready_for_review"
  | "approved_for_merge"
  | "merged"
  | "deploy_pending"
  | "deployed"
  | "rolled_back"
  | "failed"
  | "cancelled";

export type DevelopmentImpactFlag =
  | "migration"
  | "authentication"
  | "authorization"
  | "secrets"
  | "public_output"
  | "external_side_effect"
  | "deployment"
  | "destructive";

export type DevelopmentPathScope = {
  kind: "file" | "directory";
  path: string;
};

export type DevelopmentRequest = {
  id: string;
  ownerId: string;
  repositoryTargetId: string;
  baseBranch: string;
  baseSha: string;
  title: string;
  requestedOutcome: string;
  nonGoals: readonly string[];
  pathScopes: readonly DevelopmentPathScope[];
  impactFlags: readonly DevelopmentImpactFlag[];
  requiredGateIds: readonly string[];
  status: DevelopmentRequestStatus;
  workBranch: string | null;
  currentHeadSha: string | null;
  createdByPrincipalKind: "owner_browser" | "mcp_client";
  createdByClientId: string | null;
  createdAt: string;
  updatedAt: string;
  version: number;
};

export function normalizeDevelopmentPath(path: string): string;
export function normalizeBaseBranch(value: string): string;
export function validateExactCommitSha(value: string): string;
export function classifyDevelopmentRequestRisk(input: {
  impactFlags: readonly DevelopmentImpactFlag[];
  pathScopes: readonly DevelopmentPathScope[];
}): "medium" | "high" | "critical";
```

Bounds:

```text
title: 1..180
requested outcome: 1..5000
non-goals: max 50, each 1..500
path scopes: 1..200
base/work branch: 1..240
base/current SHA: exactly 40 lowercase hex
```

Risk:

- normal scoped development request: medium;
- public output/external side effect/destructive review: at least high;
- migration/authentication/authorization/secrets/deployment: critical approval path before affected execution/merge/deploy.

- [ ] **Step 1: Write failing validation tests**

Test valid files/directories, slash normalization, duplicate collapse, parent traversal/absolute/backslash/NUL/`.git` rejection, exact SHA, branch bounds and risk classification.

```ts
expect(normalizeDevelopmentPath("apps/web/src/routes/")).toBe(
  "apps/web/src/routes",
);
expect(() => normalizeDevelopmentPath("../secrets")).toThrow(
  "DEVELOPMENT_PATH_OUTSIDE_REPOSITORY",
);
expect(
  classifyDevelopmentRequestRisk({
    impactFlags: ["authentication"],
    pathScopes: [{ kind: "directory", path: "packages/auth" }],
  }),
).toBe("critical");
```

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/domain exec vitest run src/development/validation.test.ts
```

- [ ] **Step 3: Implement pure model/validation**

No GitHub, filesystem, ORM, UI or MCP imports.

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/domain exec vitest run src/development/validation.test.ts
pnpm --filter @semogtw/domain typecheck
pnpm check:boundaries
git add packages/domain/src/development packages/domain/src/index.ts
git commit -m "feat: define development request contracts"
git push
```

---

### Task 3: Implement request lifecycle transitions

**Files:**
- Create: `packages/domain/src/development/lifecycle.ts`
- Create: `packages/domain/src/development/lifecycle.test.ts`
- Modify: `packages/domain/src/development/index.ts`

**Interfaces:**

```ts
export type DevelopmentRequestTransition =
  | { type: "plan" }
  | { type: "approve_development" }
  | { type: "start"; workBranch: string; headSha: string }
  | { type: "block_verification"; reason: string }
  | { type: "resume_verification" }
  | { type: "submit_review"; headSha: string }
  | { type: "approve_merge" }
  | { type: "record_merged"; mergeSha: string }
  | { type: "mark_deploy_pending" }
  | { type: "record_deployed" }
  | { type: "record_rollback" }
  | { type: "fail"; reason: string }
  | { type: "cancel"; reason: string };

export function transitionDevelopmentRequest(input: {
  request: DevelopmentRequest;
  transition: DevelopmentRequestTransition;
  now: string;
}): DevelopmentRequest;
```

Rules:

- draft→planned only after repository/base/path/gates validate;
- planned→approved_for_development requires command approval when risk is high/critical;
- start requires accepted work branch/head equal to base SHA at first start;
- ready_for_review requires all required checkpoints complete and all required gates passed on current head;
- approved_for_merge requires separate high/critical approval and current head unchanged;
- merge/deploy states are reserved; actual external observations arrive in the executor plan;
- cancel cannot erase records;
- terminal transitions reject stale version and invalid order.

- [ ] **Step 1: Write the transition matrix tests**

Cover every allowed/denied edge and exact head/gate requirement.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/domain exec vitest run src/development/lifecycle.test.ts
```

- [ ] **Step 3: Implement deterministic transition logic**

Return stable domain errors, not generic strings.

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/domain exec vitest run src/development/lifecycle.test.ts
pnpm --filter @semogtw/domain typecheck
git add packages/domain/src/development
git commit -m "feat: add development request lifecycle"
git push
```

---

### Task 4: Add migration 0020 and relational schema

**Files:**
- Create: `packages/database/migrations/0020_development_requests.sql`
- Create: `packages/database/src/schema/development-requests.ts`
- Modify: `packages/database/src/schema/index.ts`
- Modify: `packages/database/src/index.ts`
- Create: migration tests.
- Modify: backup/restore tests.

**Tables:**

```text
development_requests
development_request_revisions
development_request_path_scopes
development_request_impact_flags
development_request_checkpoints
development_request_commits
development_request_gate_evidence
development_request_external_refs
development_request_events
```

References:

```text
development_requests.repository_target_id → existing repository_targets
development_request checkpoints/reservations/obligations store canonical existing IDs, not duplicated bodies
created_by_client_id → mcp_oauth_clients nullable
approved/executed command receipt/approval IDs → command tables nullable
```

Required constraints:

- exact SHA length/lowercase-hex checks;
- path scope uniqueness per request;
- checkpoint sequence uniqueness/contiguity enforced by repository service;
- commit SHA uniqueness per request;
- gate evidence exact request/head/gate key uniqueness;
- append-only revisions/events;
- no cascade delete of request history;
- no raw repository credentials, patches, logs or model prompts.

- [ ] **Step 1: Write failing migration tests**

Test schema/checks/FKs/indexes, no duplicate orchestration tables, no secret/patch columns and repeated migration application.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/database exec vitest run src/development-requests-migrations.test.ts src/adapters/sqlite-migrations.test.ts
```

- [ ] **Step 3: Implement migration/schema**

Use UTC ISO timestamps and integer versions.

- [ ] **Step 4: Extend backup/restore tests**

Prove requests/history/refs survive restore and existing reservation/obligation records remain canonical.

- [ ] **Step 5: Run and commit**

```bash
pnpm --filter @semogtw/database exec vitest run \
  src/development-requests-migrations.test.ts \
  src/adapters/sqlite-migrations.test.ts \
  src/backup/sqlite-backup.test.ts
pnpm --filter @semogtw/database typecheck
git add packages/database
git commit -m "feat: add development request persistence"
git push
```

---

### Task 5: Implement request/revision repository with optimistic concurrency

**Files:**
- Create: `packages/database/src/repositories/development-request-repository.ts`
- Create: `packages/database/src/repositories/development-request-repository.test.ts`
- Modify: `packages/database/src/index.ts`

**Interfaces:**

```ts
export interface DevelopmentRequestRepository {
  createWithRevision(input: CreateDevelopmentRequestRecord): DevelopmentRequestRecord;
  findById(input: {
    ownerId: string;
    requestId: string;
  }): DevelopmentRequestRecord | null;
  updatePlanWithRevision(input: UpdateDevelopmentPlanRecord): DevelopmentRequestRecord | null;
  transitionWithEvent(input: TransitionDevelopmentRequestRecord): DevelopmentRequestRecord | null;
  attachReservationRefs(input: AttachDevelopmentReservationRefsRecord): boolean;
  attachVerificationObligationRefs(input: AttachDevelopmentObligationRefsRecord): boolean;
  recordExternalRef(input: RecordDevelopmentExternalRef): boolean;
}
```

Rules:

- create request + path/impact/revision/event/audit/command receipt atomically through command composition;
- plan update creates an immutable revision with canonical payload hash;
- expected version required for update/transition;
- repository target owner/status is checked;
- path/impact nested rows replace atomically only while draft/planned;
- external refs are allowlisted kinds (`run`, `reservation`, `obligation`, `snapshot`, later `pull_request`, `deployment`) and bounded values.

- [ ] **Step 1: Write failing repository tests**

Test atomic create, immutable revisions, optimistic conflict, same-owner target, invalid status edit, nested replacement and no partial refs.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/database exec vitest run src/repositories/development-request-repository.test.ts
```

- [ ] **Step 3: Implement repository**

Return normalized records without raw repository provider responses.

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/database exec vitest run src/repositories/development-request-repository.test.ts
pnpm --filter @semogtw/database typecheck
git add packages/database/src
git commit -m "feat: add development request repository"
git push
```

---

### Task 6: Implement request creation/planning services and existing-target resolution

**Files:**
- Create: `packages/domain/src/development/request-service.ts`
- Create: `packages/domain/src/development/request-service.test.ts`
- Modify: `packages/domain/src/development/index.ts`
- Modify: database composition to supply existing repository target and request ports.

**Interfaces:**

```ts
export interface DevelopmentRequestService {
  create(input: {
    repositoryTargetId: string;
    baseBranch: string;
    baseSha: string;
    title: string;
    requestedOutcome: string;
    nonGoals: readonly string[];
    pathScopes: readonly DevelopmentPathScope[];
    impactFlags: readonly DevelopmentImpactFlag[];
    requiredGateIds: readonly string[];
  }, context: DevelopmentMutationContext): Promise<DevelopmentRequestResult>;

  updatePlan(input: {
    requestId: string;
    expectedVersion: number;
    requestedOutcome: string;
    nonGoals: readonly string[];
    pathScopes: readonly DevelopmentPathScope[];
    impactFlags: readonly DevelopmentImpactFlag[];
    requiredGateIds: readonly string[];
    reason: string;
  }, context: DevelopmentMutationContext): Promise<DevelopmentRequestResult>;
}
```

Creation checks:

- repository target exists, same owner, active/accepted;
- supplied base branch equals the accepted target branch or an explicitly allowed branch;
- supplied base SHA matches a persisted fresh observation for that branch;
- no live provider request is required for domain validity;
- stale/unknown observation returns `BASE_OBSERVATION_REQUIRED`;
- impact flags may be escalated by deterministic path rules, never lowered by caller omission.

Path escalations:

```text
packages/auth, authorization/security policy paths → authentication/authorization
packages/database/migrations                     → migration
DEPLOYMENT.md, deployment adapters               → deployment
secret/config credential adapters                → secrets
public route/serializer paths                     → public_output
```

- [ ] **Step 1: Write failing service tests**

Test target/branch/SHA binding, stale observation, path-driven impact escalation, revision creation and caller inability to omit critical flags.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/domain exec vitest run src/development/request-service.test.ts
```

- [ ] **Step 3: Implement services with injected ports**

No GitHub SDK/network imports.

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/domain exec vitest run src/development/request-service.test.ts
pnpm --filter @semogtw/domain typecheck
git add packages/domain/src/development packages/database/src/composition
git commit -m "feat: create repository-bound development requests"
git push
```

---

### Task 7: Implement checkpoints and exact-SHA verification evidence

**Files:**
- Create: `packages/domain/src/development/checkpoint-service.ts`
- Create: `packages/domain/src/development/checkpoint-service.test.ts`
- Create: `packages/domain/src/development/verification-evidence.ts`
- Create: `packages/domain/src/development/verification-evidence.test.ts`
- Create: `packages/database/src/repositories/development-checkpoint-repository.ts`
- Create: `packages/database/src/repositories/development-checkpoint-repository.test.ts`
- Create: `packages/database/src/repositories/development-verification-repository.ts`
- Create: `packages/database/src/repositories/development-verification-repository.test.ts`
- Modify: indexes.

**Interfaces:**

```ts
export type DevelopmentCheckpointStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "blocked"
  | "cancelled";

export type DevelopmentGateEvidence = {
  id: string;
  requestId: string;
  verificationObligationId: string;
  commitSha: string;
  command: string;
  environment: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  status: "passed" | "failed" | "blocked";
  failureClassification:
    | "code_failure"
    | "environment"
    | "quota"
    | "dependency"
    | "external_service"
    | null;
  boundedSummary: string;
  artifactRef: string | null;
};

export function validateDevelopmentGateEvidence(
  input: DevelopmentGateEvidence,
): DevelopmentGateEvidence;
```

Rules:

- checkpoint sequence contiguous and stable;
- completion requires bounded result summary;
- gate `passed` requires null failure classification;
- failed/blocked requires classification;
- exact current request head SHA required;
- command/environment/summary bounded and secret scanned;
- artifact refs use approved private storage/provider reference forms, no bearer query params;
- evidence references existing verification obligation rather than replacing it.

- [ ] **Step 1: Write failing domain tests**

Test state transitions, sequence, exact SHA, classification matrix, summary/artifact bounds and secret markers.

- [ ] **Step 2: Write failing repository tests**

Test checkpoint/event atomicity, gate uniqueness, stale head rejection, no inference from commit presence and immutable past evidence.

- [ ] **Step 3: Run and verify failure**

```bash
pnpm --filter @semogtw/domain exec vitest run src/development/checkpoint-service.test.ts src/development/verification-evidence.test.ts
pnpm --filter @semogtw/database exec vitest run src/repositories/development-checkpoint-repository.test.ts src/repositories/development-verification-repository.test.ts
```

- [ ] **Step 4: Implement and commit**

```bash
pnpm --filter @semogtw/domain test -- development
pnpm --filter @semogtw/database test -- development
git add packages/domain/src/development packages/database/src
git commit -m "feat: record development checkpoints and gates"
git push
```

---

### Task 8: Register Development Request commands and manifests

**Files:**
- Create: application command files/tests from planned structure.
- Create: `packages/application/src/development/manifests.ts`
- Modify: `packages/application/src/index.ts`
- Create or Modify: `packages/database/src/composition/development-command-registry.ts`
- Modify: DevOS command registry/coverage docs.

**Command metadata:**

```text
development.requests.create
  capability: development.request
  risk: dynamic medium/high/critical
  batchable: false

development.requests.update_plan
  capability: development.request
  risk: dynamic medium/high/critical

development.sessions.start
  capability: development.request
  risk: medium/high

development.checkpoints.record
  capability: development.request
  risk: low/medium

development.verification.record_result
  capability: development.request
  risk: medium

development.requests.submit_review
  capability: development.request
  risk: high
development.requests.cancel
  capability: development.request
  risk: medium
```

Rules:

- server/domain escalated impact controls command risk;
- create/update critical plans require DevOS approval before `approved_for_development` or start, not necessarily before saving a draft;
- start does not invoke an executor; it reserves scopes/obligations and records `executor_pending` external state;
- submit review requires exact current head and all required gates passed;
- no command accepts raw patch, shell command or credentials.

- [ ] **Step 1: Write failing command tests**

Test schemas, resources, dynamic risk, output bounds, approval dispositions and domain-result mapping.

- [ ] **Step 2: Implement command adapters**

Reuse domain services and existing orchestration services through injected transaction-bound ports.

- [ ] **Step 3: Add editability manifests**

Include owner UI routes, MCP `control_plane`, approval/undo/conflict/audit behavior.

- [ ] **Step 4: Run gates and commit**

```bash
pnpm --filter @semogtw/application test -- development
pnpm --filter @semogtw/database test -- development-command
pnpm check:editability-coverage
git add packages/application/src packages/database/src docs/architecture/EDITABILITY_COVERAGE.md
git commit -m "feat: register Development Control Plane commands"
git push
```

---

### Task 9: Integrate cooperative reservations and verification obligations on start

**Files:**
- Modify: `packages/domain/src/development/request-service.ts`
- Modify: existing orchestration service composition.
- Modify: `packages/database/src/composition/development-command-registry.ts`
- Add integration tests.

**Start sequence:**

```text
1. reload approved/current request and repository target
2. verify base branch/SHA has not changed unexpectedly
3. find overlapping active scope reservations
4. deny or require approved override on conflict
5. create reservations for request path scopes
6. create/link exact-SHA verification obligations for required gates
7. create cooperative run ledger entry or link planned run
8. transition request to in_progress with work branch/current head
9. commit request/reservation/obligation/run refs/audit/receipt atomically where one DB covers them
```

Work branch deterministic default:

```text
devos/<request-id-short>/<sanitized-title-slug>
```

Maximum 120 chars; caller-provided alternate branch must pass the same validation and repository policy.

- [ ] **Step 1: Write failing integration tests**

Test conflict, override approval, stale base SHA, atomic reservations/obligations/refs, deterministic branch and rollback.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/database exec vitest run src/composition/development-command-registry.test.ts
```

- [ ] **Step 3: Implement composition without duplicating orchestration rules**

Call existing services/repositories. Do not write their tables directly from the development domain.

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/domain test -- development
pnpm --filter @semogtw/database test -- development
pnpm check:run-ledger-guardrails
git add packages/domain/src/development packages/database/src/composition
git commit -m "feat: bind development requests to workflow controls"
git push
```

---

### Task 10: Add private Development Request read model

**Files:**
- Create: `packages/database/src/repositories/development-read-model.ts`
- Create: `packages/database/src/repositories/development-read-model.test.ts`
- Modify: `packages/database/src/index.ts`

**Interfaces:**

```ts
export interface DevelopmentReadModel {
  list(input: {
    ownerId: string;
    statuses: readonly DevelopmentRequestStatus[];
    limit: number;
    cursor: string | null;
  }): PaginatedDevelopmentRequestSummaries;
  get(input: {
    ownerId: string;
    requestId: string;
  }): DevelopmentRequestDetail | null;
}
```

Detail includes bounded projections of:

```text
request/current revision
repository target/base/current head
path scopes/impact flags
checkpoints
reservation/obligation status references
commits/gate evidence
run/recovery/external refs
approval/command receipt status
next permitted owner actions
```

It excludes:

```text
OAuth/secret values
raw logs/artifacts
raw patches/source code
private provider response bodies
shell output
```

- [ ] **Step 1: Write failing read-model tests**

Test owner isolation, cursor bounds, malformed historical JSON fallback, missing referenced record handling, stale/head mismatch labels and no secret keys.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/database exec vitest run src/repositories/development-read-model.test.ts
```

- [ ] **Step 3: Implement read model**

Use bounded batch queries and existing read services for referenced orchestration data where practical.

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/database exec vitest run src/repositories/development-read-model.test.ts
pnpm --filter @semogtw/database typecheck
git add packages/database/src
git commit -m "feat: add Development Control Plane read model"
git push
```

---

### Task 11: Build owner planning/review UI

**Files:**
- Create: server/route/component/style files from planned structure.
- Modify: DevOS navigation.

**Normal creation fields:**

```text
Repositório aprovado             required selector
Branch-base                      prefilled from target
SHA-base observado               read-only selection
Resultado desejado               required
O que não deve mudar             optional repeated items
Escopo esperado                  guided path chips/editor
Gates necessários                guided selection
```

Advanced section:

```text
impact flags and server escalations
canonical IDs
exact resource/version/SHA bindings
MCP references
reservation/obligation IDs
```

Detail page displays cards/timeline, not a spreadsheet:

```text
Current status and next action
Plan/revision
Repository/branch/head
Scope reservation conflicts
Checkpoints
Verification evidence
Commits observed/recorded
Approvals
Run/recovery links
Executor status: not configured/pending
```

- [ ] **Step 1: Write failing server tests**

Test owner auth/CSRF, target/observation resolution, command gateway use, approval-required result, optimistic conflict and no executor side effect.

- [ ] **Step 2: Write failing component tests**

Test required fields, guided path validation, automatic impact escalation display, approval path, timeline status and 360 px behavior.

- [ ] **Step 3: Implement handlers/routes/components**

All mutations use registered commands; reads use the bounded read model.

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/web test -- development
pnpm --filter @semogtw/web typecheck
git add apps/web/src packages/ui/src
git commit -m "feat: add Development Control Plane planning UI"
git push
```

---

### Task 12: Add bounded MCP control-plane tools after write gates

**Files:**
- Create: `packages/mcp/src/development-control-tools.ts`
- Create: `packages/mcp/src/development-control-tools.test.ts`
- Modify: `packages/mcp/src/catalog.ts`
- Modify: `packages/mcp/src/index.ts`
- Modify: MCP composition/tests.

**Specific tools:**

```text
devos_create_development_request
devos_update_development_plan
devos_start_development_session
devos_get_development_status
devos_record_development_checkpoint
devos_record_verification_result
devos_submit_change_for_review
devos_cancel_development_request
```

Rules:

- read tool may appear with authorized read scope;
- writes require `devos.development.request`, effective capability/resource grants and switches;
- confirmation/approval results use standard Command Gateway result shape;
- inputs are typed/bounded and never accept shell, patch, credentials or arbitrary URLs;
- start records plan/reservations only; no executor dispatch;
- output size/sensitive scans remain enforced.

- [ ] **Step 1: Write failing tool tests**

Test discovery filtering, strict schemas, no grant/switch denial, confirmation/approval, wrong repository/path scope, idempotency and no executor invocation.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/mcp exec vitest run src/development-control-tools.test.ts
```

- [ ] **Step 3: Implement only after remote read/write gates pass**

If blocked, keep the plan pending; do not register partial externally reachable tools.

- [ ] **Step 4: Run protocol/boundary tests and commit**

```bash
pnpm --filter @semogtw/mcp test
pnpm check:mcp-package-boundaries
pnpm check:mcp-transport-boundary
pnpm check:mcp-node-runtime-boundary
git add packages/mcp apps/mcp apps/mcp-http
git commit -m "feat: add supervised development request tools"
git push
```

---

### Task 13: Verify lifecycle, scope conflicts, exact gates and no-executor behavior E2E

**Files:**
- Create: `tests/e2e/development-requests-control-plane.spec.ts`
- Modify: test matrix, architecture/data/security/runbook/changelog docs.

**E2E scenarios:**

1. create a request from an accepted repository target/base observation;
2. path under auth automatically escalates critical impact;
3. normal scoped request becomes planned/approved/startable according to risk;
4. overlapping reservation blocks start;
5. approved override allows start and creates linked reservations/obligations/run ref;
6. UI shows executor not configured and performs no GitHub/shell write;
7. record checkpoints/commit/gate evidence for exact head;
8. wrong-SHA passed evidence is rejected;
9. environment-blocked gate is not code failure;
10. submit review fails until required gates pass;
11. changed head invalidates stale evidence/approval;
12. MCP client outside repository/path grant cannot create/start;
13. public output contains no request/repository/branch/path/SHA/gate data;
14. mobile detail remains usable at 360 px.

- [ ] **Step 1: Implement E2E and fakes**

Use persisted repository observations/test fixtures; do not call live GitHub.

- [ ] **Step 2: Run focused/full gates**

```bash
pnpm check:run-ledger-guardrails
pnpm check:editability-coverage
pnpm check:public-confidentiality
pnpm --filter @semogtw/domain test
pnpm --filter @semogtw/application test
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/mcp test
pnpm --filter @semogtw/web test
pnpm --filter @semogtw/web typecheck
pnpm --filter @semogtw/web build
pnpm exec playwright test tests/e2e/development-requests-control-plane.spec.ts
pnpm check
pnpm build
```

- [ ] **Step 3: Verify no executor/provider write imports**

```bash
rg -n "child_process|spawn\(|exec\(|simple-git|octokit.*create|pulls\.create|deploy" \
  packages/domain/src/development packages/application/src/development \
  packages/database/src apps/web/src/server/devos-development.ts packages/mcp/src/development-control-tools.ts
```

Expected: no raw execution/provider write implementation in this plan.

- [ ] **Step 4: Update docs by reference and commit**

```bash
git add tests/e2e/development-requests-control-plane.spec.ts \
  docs/testing/2026-08-03-development-requests-control-plane-test-matrix.md \
  docs/architecture/DEVELOPMENT_CONTROL_PLANE.md docs/architecture/EDITABILITY_COVERAGE.md \
  docs/ARCHITECTURE.md docs/DATA_MODEL.md docs/MCP.md SECURITY.md RUNBOOK.md CHANGELOG.md
git commit -m "test: verify Development Request control plane"
git push
```

## Acceptance criteria

This plan is complete only when:

- Development Requests are repository/branch/exact-SHA/path bound;
- existing target/reservation/obligation/recovery/run-ledger subsystems remain canonical;
- path-driven impact cannot be hidden by callers;
- lifecycle/status transitions are tested and optimistic;
- start creates/links reservations, obligations and run context atomically;
- gate evidence is exact-SHA and accurately classified;
- ready-for-review cannot be asserted without required passed gates;
- owner UI is guided, understandable and mobile usable;
- MCP tools are specific, scoped and gated when enabled;
- no executor, GitHub write, shell, merge, deploy or rollback is introduced;
- public confidentiality and full gates pass.
