# Semogtw Learning Goals Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the provider-neutral Semogtw DevOS Growth core for learning goals, checkpoints, skills and reproducibly derived progress.

**Architecture:** Add a framework-free Growth domain, additive SQLite migration/repositories and owner-only DevOS routes. Goal progress is computed from checkpoint state and accepted values; no API, database column or UI action directly sets an arbitrary percentage.

**Tech Stack:** Node.js 22, TypeScript, Zod, SQLite/Drizzle, TanStack Start/Router, React, Vitest, Playwright, pnpm workspaces.

## Global Constraints

- Implement from the newest consolidated branch containing `docs/superpowers/specs/2026-08-03-semogtw-learning-growth-evidence-design.md`.
- Reconcile migration numbering before coding. The approved order reserves `0014_mcp_oauth.sql` and assigns `0015_learning_goals.sql` to this plan.
- Keep Growth domain code free of React, TanStack, Hono, Drizzle, SQLite, MCP SDK and provider SDK imports.
- Support learning goals only in the initial aggregate; do not generalize to health, finance or unrelated habits.
- Never persist or accept a canonical `goal_progress_percent` field.
- Derive progress from checkpoint weights and binary/numeric completion ratios.
- Require owner authorization, CSRF, idempotency and expected versions for mutations.
- Require explicit confirmation/reason for goal cancellation, checkpoint waiver and destructive taxonomy changes.
- Preserve immutable domain events and global audit in the same transaction as entity mutation.
- Keep all Growth state private and excluded from public serializers, routes, static output and indexing.
- Commit and push after every independently reviewable task.

---

## Planned file structure

```text
packages/domain/src/growth/
  model.ts
  validation.ts
  progress.ts
  goal-service.ts
  checkpoint-service.ts
  skill-service.ts
  index.ts
  *.test.ts

packages/database/
  migrations/0015_learning_goals.sql
  src/schema/growth.ts
  src/repositories/learning-goal-repository.ts
  src/repositories/learning-checkpoint-repository.ts
  src/repositories/skill-repository.ts
  src/repositories/growth-read-model.ts
  src/repositories/*.test.ts
  src/growth-migrations.test.ts

apps/web/src/
  routes/devos.growth.tsx
  routes/devos.growth.index.tsx
  routes/devos.growth.goals.tsx
  routes/devos.growth.goals.index.tsx
  routes/devos.growth.goals.$goalId.tsx
  routes/devos.growth.skills.tsx
  components/devos/growth-overview.tsx
  components/devos/learning-goal-form.tsx
  components/devos/learning-checkpoint-form.tsx
  components/devos/learning-checkpoint-list.tsx
  components/devos/skill-management.tsx
  server/devos-growth.ts
  server/devos-growth-mutations.ts
  styles/growth.css

packages/ui/src/navigation/devos-sidebar.tsx
tests/e2e/growth-core.spec.ts
docs/testing/2026-08-03-learning-goals-core-test-matrix.md
```

---

### Task 1: Reconcile baseline and reserve the migration

**Files:**
- Create: `docs/testing/2026-08-03-learning-goals-core-test-matrix.md`
- Modify: `docs/DATA_MODEL.md`
- Modify: `docs/superpowers/plans/README.md`

**Interfaces:**
- Consumes: current migrations, backup verification and private owner/auth mutation conventions.
- Produces: exact base SHA, observed baseline commands and confirmed migration number for later tasks.

- [ ] **Step 1: Verify branch ancestry and migration availability**

```bash
git fetch --all --prune
git rev-parse HEAD
ls packages/database/migrations
rg "0014_|0015_" packages/database/migrations docs/superpowers
```

Expected: one canonical newest head is recorded. `0015_learning_goals.sql` is unused, or numbering is reconciled in the specification/plans before implementation.

- [ ] **Step 2: Run the current baseline**

```bash
pnpm install --frozen-lockfile
pnpm check:boundaries
pnpm check:public-confidentiality
pnpm --filter @semogtw/domain test
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/web typecheck
pnpm --filter @semogtw/web build
```

Expected: record observed pass/failure/block classifications and exact counts in the matrix. Do not copy older counts.

- [ ] **Step 3: Add a planned data-model section**

Document that migration `0015` will create goals, checkpoints, skills, links and append-only events, while progress remains derived. Do not describe tables as implemented before the migration exists.

- [ ] **Step 4: Commit**

```bash
git add docs/DATA_MODEL.md docs/testing/2026-08-03-learning-goals-core-test-matrix.md docs/superpowers/plans/README.md
git commit -m "docs: establish learning core baseline"
git push
```

---

### Task 2: Define Growth domain contracts and validation

**Files:**
- Create: `packages/domain/src/growth/model.ts`
- Create: `packages/domain/src/growth/validation.ts`
- Create: `packages/domain/src/growth/validation.test.ts`
- Create: `packages/domain/src/growth/index.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

```ts
export type LearningGoalStatus =
  | "draft"
  | "active"
  | "paused"
  | "completed"
  | "cancelled"
  | "archived";

export type LearningCheckpointStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "waived"
  | "cancelled";

export type CheckpointCompletionMode =
  | { kind: "binary" }
  | { kind: "numeric"; unit: string; target: number };

export type SkillStage =
  | "introduced"
  | "practicing"
  | "applied"
  | "demonstrated";

export function normalizeLearningGoalSlug(value: string): string;
export function normalizeCheckpointWeight(value: number): number;
export function validateCompletionMode(value: unknown): CheckpointCompletionMode;
export function normalizeSkillSlug(value: string): string;
```

- [ ] **Step 1: Write failing validation tests**

Cover:

```ts
normalizeLearningGoalSlug("  Python Automation ") === "python-automation"
normalizeCheckpointWeight(1) === 1
normalizeCheckpointWeight(100) === 100
normalizeSkillSlug(" Node.JS ") === "node-js"
```

Reject empty/overlong titles, unsafe slugs, weight outside `1..100`, numeric target `<= 0`, non-finite numbers, overlong units, invalid status strings and non-canonical timestamps.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/domain exec vitest run src/growth/validation.test.ts
```

Expected: FAIL because the Growth module does not exist.

- [ ] **Step 3: Implement minimal framework-free contracts**

Use pure values and stable error codes. Do not add persistence, framework or provider concepts.

- [ ] **Step 4: Run checks**

```bash
pnpm --filter @semogtw/domain exec vitest run src/growth/validation.test.ts
pnpm --filter @semogtw/domain typecheck
pnpm check:boundaries
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/growth packages/domain/src/index.ts
git commit -m "feat: define learning growth contracts"
git push
```

---

### Task 3: Implement deterministic progress derivation

**Files:**
- Create: `packages/domain/src/growth/progress.ts`
- Create: `packages/domain/src/growth/progress.test.ts`
- Modify: `packages/domain/src/growth/index.ts`

**Interfaces:**

```ts
export type CheckpointProgressInput = {
  status: LearningCheckpointStatus;
  weight: number;
  completionMode: CheckpointCompletionMode;
  acceptedValue: number | null;
};

export type GoalProgressProjection = {
  percent: number;
  completedWeight: number;
  effectiveWeight: number;
  requiredCheckpointsComplete: boolean;
  explanation: readonly {
    checkpointId: string;
    ratio: number;
    weightedContribution: number;
  }[];
};

export function deriveGoalProgress(
  checkpoints: readonly (CheckpointProgressInput & { checkpointId: string; required: boolean })[],
): GoalProgressProjection;
```

- [ ] **Step 1: Write failing progress tests**

Test binary pending/completed, numeric clamping, waived checkpoints, cancelled denominator exclusion, mixed weights, no active checkpoints, and required checkpoint completion.

Assert:

```ts
// 20-weight completed + 80-weight numeric 50/100 = 60%
projection.percent === 60
```

Assert no function accepts a direct percentage input.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/domain exec vitest run src/growth/progress.test.ts
```

- [ ] **Step 3: Implement deterministic arithmetic**

Round only the displayed percent to two decimal places; retain exact weighted contribution internally. Return zero with an explicit empty explanation when no effective checkpoints exist.

- [ ] **Step 4: Run checks and commit**

```bash
pnpm --filter @semogtw/domain exec vitest run src/growth/progress.test.ts
pnpm --filter @semogtw/domain typecheck
git add packages/domain/src/growth
git commit -m "feat: derive learning goal progress"
git push
```

---

### Task 4: Add goal, checkpoint and skill lifecycle services

**Files:**
- Create: `packages/domain/src/growth/ports.ts`
- Create: `packages/domain/src/growth/goal-service.ts`
- Create: `packages/domain/src/growth/goal-service.test.ts`
- Create: `packages/domain/src/growth/checkpoint-service.ts`
- Create: `packages/domain/src/growth/checkpoint-service.test.ts`
- Create: `packages/domain/src/growth/skill-service.ts`
- Create: `packages/domain/src/growth/skill-service.test.ts`
- Modify: `packages/domain/src/growth/index.ts`

**Interfaces:**

```ts
export interface GrowthClock { now(): string }
export interface GrowthIdGenerator { next(prefix: string): string }

export interface LearningGoalRepository {
  create(input: CreateLearningGoalRecord): LearningGoalRecord;
  getById(id: string): LearningGoalAggregate | null;
  update(input: UpdateLearningGoalRecord): LearningGoalAggregate;
}

export interface LearningCheckpointRepository {
  add(input: AddLearningCheckpointRecord): LearningCheckpointRecord;
  update(input: UpdateLearningCheckpointRecord): LearningCheckpointRecord;
  reorder(input: ReorderLearningCheckpointsRecord): readonly LearningCheckpointRecord[];
}

export interface SkillRepository {
  create(input: CreateSkillRecord): SkillRecord;
  merge(input: MergeSkillRecord): SkillRecord;
  linkGoal(input: LinkGoalSkillRecord): void;
  linkCheckpoint(input: LinkCheckpointSkillRecord): void;
}
```

Services must expose explicit commands for create draft, activate, pause, resume, complete, cancel/archive; checkpoint add/start/record accepted value/complete/waive/cancel/reorder; skill create/merge/archive/link.

- [ ] **Step 1: Write failing transition tests**

Cover valid/invalid transitions, completion requiring 100% and required checkpoints, cancellation/waiver confirmation, expected-version conflicts, idempotent retries, duplicate slug/sequence and skill merge cycle rejection.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/domain exec vitest run src/growth/*service.test.ts
```

- [ ] **Step 3: Implement minimal services**

Generate actor/event/correlation identities outside repository input where existing project conventions require. Keep policy decisions in domain services rather than UI handlers.

- [ ] **Step 4: Run checks and commit**

```bash
pnpm --filter @semogtw/domain exec vitest run src/growth
pnpm --filter @semogtw/domain typecheck
pnpm check:boundaries
git add packages/domain/src/growth
git commit -m "feat: add learning growth lifecycles"
git push
```

---

### Task 5: Add migration `0015_learning_goals.sql`

**Files:**
- Create: `packages/database/migrations/0015_learning_goals.sql`
- Create: `packages/database/src/schema/growth.ts`
- Modify: `packages/database/src/schema/index.ts`
- Create: `packages/database/src/growth-migrations.test.ts`
- Modify: `packages/database/src/adapters/sqlite-migrations.test.ts`
- Modify: `packages/database/src/backup/sqlite-backup.test.ts`
- Modify: `packages/database/src/index.ts`

**Interfaces:**

Create:

```text
learning_goals
learning_goal_events
learning_checkpoints
learning_checkpoint_events
skills
skill_alias_events
learning_goal_skills
learning_checkpoint_skills
```

Required constraints:

- unique canonical goal/skill slugs;
- checkpoint sequence unique and positive per goal;
- checkpoint weight `1..100`;
- numeric targets/accepted values valid for numeric mode;
- canonical lifecycle statuses;
- version positive;
- append-only events with contiguous per-entity sequence;
- no `goal_progress_percent` column.

- [ ] **Step 1: Write failing migration tests**

Assert fresh order through `0015`, repeated migration idempotency, foreign keys, unique indexes, update/delete rejection for event tables and absence of any canonical percentage column.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/database exec vitest run src/growth-migrations.test.ts src/adapters/sqlite-migrations.test.ts
```

- [ ] **Step 3: Implement SQL and schema mappings**

Use additive tables/indexes/triggers only. Preserve UTC ISO text timestamps and integer versions.

- [ ] **Step 4: Extend backup verification**

Add representative goals/checkpoints/skills/events and verify restored derived progress uses unchanged canonical rows.

- [ ] **Step 5: Run checks and commit**

```bash
pnpm --filter @semogtw/database exec vitest run \
  src/growth-migrations.test.ts \
  src/adapters/sqlite-migrations.test.ts \
  src/backup/sqlite-backup.test.ts
pnpm --filter @semogtw/database typecheck
git add packages/database
git commit -m "feat: add learning goals schema"
git push
```

---

### Task 6: Implement transactional SQLite repositories

**Files:**
- Create: `packages/database/src/repositories/learning-goal-repository.ts`
- Create: `packages/database/src/repositories/learning-goal-repository.test.ts`
- Create: `packages/database/src/repositories/learning-checkpoint-repository.ts`
- Create: `packages/database/src/repositories/learning-checkpoint-repository.test.ts`
- Create: `packages/database/src/repositories/skill-repository.ts`
- Create: `packages/database/src/repositories/skill-repository.test.ts`
- Modify: `packages/database/src/index.ts`

**Interfaces:**
- Implements the repository ports from Task 4.
- Every entity mutation writes entity + domain event + global `audit_events` in one `IMMEDIATE` transaction.

- [ ] **Step 1: Write failing repository tests**

Cover create/update transitions, idempotency reuse with same/different payload, stale version rollback, event/audit failure rollback, checkpoint contiguous sequence/reorder, skill merge alias history and link uniqueness.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/database exec vitest run src/repositories/*learning*.test.ts src/repositories/skill-repository.test.ts
```

- [ ] **Step 3: Implement repositories**

Map database rows to domain records explicitly; never spread raw rows into DTOs. Keep mutation context bound to the target entity before writes.

- [ ] **Step 4: Run checks and commit**

```bash
pnpm --filter @semogtw/database exec vitest run src/repositories/*learning*.test.ts src/repositories/skill-repository.test.ts
pnpm --filter @semogtw/database typecheck
git add packages/database/src/repositories packages/database/src/index.ts
git commit -m "feat: persist learning goals transactionally"
git push
```

---

### Task 7: Add Growth read models

**Files:**
- Create: `packages/database/src/repositories/growth-read-model.ts`
- Create: `packages/database/src/repositories/growth-read-model.test.ts`
- Modify: `packages/database/src/index.ts`

**Interfaces:**

```ts
export type GrowthOverviewRead = {
  activeGoals: readonly LearningGoalSummaryRead[];
  dueCheckpoints: readonly LearningCheckpointSummaryRead[];
  skillSummaries: readonly SkillSummaryRead[];
  generatedAt: string;
};

export interface GrowthReadService {
  getOverview(): GrowthOverviewRead;
  listGoals(input: { statuses: readonly LearningGoalStatus[]; limit: number }): readonly LearningGoalSummaryRead[];
  getGoal(id: string): LearningGoalDetailRead | null;
  listSkills(input: { includeArchived: boolean; limit: number }): readonly SkillSummaryRead[];
}
```

- [ ] **Step 1: Write failing read-model tests**

Assert deterministic ordering, limits `1..50`, derived progress, due-date behavior, archived filtering, skill alias resolution, malformed-row fail-closed behavior and no audit/private-internal fields in DTOs.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/database exec vitest run src/repositories/growth-read-model.test.ts
```

- [ ] **Step 3: Implement explicit DTO projections**

Use the domain progress function. Do not persist/materialize percentages.

- [ ] **Step 4: Run checks and commit**

```bash
pnpm --filter @semogtw/database exec vitest run src/repositories/growth-read-model.test.ts
pnpm --filter @semogtw/database typecheck
git add packages/database/src/repositories/growth-read-model* packages/database/src/index.ts
git commit -m "feat: add learning growth read models"
git push
```

---

### Task 8: Add owner-only server composition and routes

**Files:**
- Create: `apps/web/src/server/devos-growth.ts`
- Create: `apps/web/src/server/devos-growth.test.ts`
- Create: `apps/web/src/server/devos-growth-mutations.ts`
- Create: `apps/web/src/server/devos-growth-mutations.test.ts`
- Create: `apps/web/src/routes/devos.growth.tsx`
- Create: `apps/web/src/routes/devos.growth.index.tsx`
- Create: `apps/web/src/routes/devos.growth.goals.tsx`
- Create: `apps/web/src/routes/devos.growth.goals.index.tsx`
- Create: `apps/web/src/routes/devos.growth.goals.$goalId.tsx`
- Create: `apps/web/src/routes/devos.growth.skills.tsx`

**Interfaces:**

Server functions:

```ts
readGrowthOverview()
readLearningGoals(input)
readLearningGoal(goalId)
readSkills(input)
createLearningGoal(input)
transitionLearningGoal(input)
addLearningCheckpoint(input)
updateLearningCheckpoint(input)
reorderLearningCheckpoints(input)
createSkill(input)
mergeSkill(input)
linkGoalSkill(input)
linkCheckpointSkill(input)
```

- [ ] **Step 1: Write failing server/security tests**

Assert owner resolution before database open, CSRF on mutations, expected version/idempotency, generic sanitized errors, confirmation/reason for cancel/waive/merge and `noindex` metadata.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/web exec vitest run src/server/devos-growth*.test.ts
```

- [ ] **Step 3: Implement server composition**

Follow existing node-database and owner-auth composition. Invalidate routes only after committed mutations.

- [ ] **Step 4: Implement route shells**

Anonymous access redirects before private reads. Route modules import only browser-safe DTOs/stubs.

- [ ] **Step 5: Run checks and commit**

```bash
pnpm --filter @semogtw/web exec vitest run src/server/devos-growth*.test.ts
pnpm --filter @semogtw/web typecheck
pnpm check:public-confidentiality
git add apps/web/src/server apps/web/src/routes
git commit -m "feat: add private learning growth routes"
git push
```

---

### Task 9: Build Growth UI and navigation

**Files:**
- Create: `apps/web/src/components/devos/growth-overview.tsx`
- Create: `apps/web/src/components/devos/learning-goal-form.tsx`
- Create: `apps/web/src/components/devos/learning-checkpoint-form.tsx`
- Create: `apps/web/src/components/devos/learning-checkpoint-list.tsx`
- Create: `apps/web/src/components/devos/skill-management.tsx`
- Create: `apps/web/src/styles/growth.css`
- Modify: `packages/ui/src/navigation/devos-sidebar.tsx`
- Test: `apps/web/src/components/devos/growth*.test.tsx`

- [ ] **Step 1: Write failing component/route-structure tests**

Cover derived progress explanation, ordered checkpoints, numeric/binary controls, status labels, stale-version error, confirmation UI and no direct percentage field.

- [ ] **Step 2: Implement desktop and 360 px layouts**

Keep title/status/progress/next checkpoint above the fold. Use cards/lists rather than horizontal tables.

- [ ] **Step 3: Add navigation**

Add one private sidebar item named `Crescimento` pointing to `/devos/growth`; do not expose it publicly.

- [ ] **Step 4: Run checks and commit**

```bash
pnpm --filter @semogtw/web test
pnpm --filter @semogtw/ui typecheck
pnpm --filter @semogtw/web typecheck
pnpm check:public-confidentiality
git add apps/web/src/components apps/web/src/styles packages/ui/src/navigation/devos-sidebar.tsx
git commit -m "feat: add learning growth workspace"
git push
```

---

### Task 10: Add browser acceptance and finalize documentation

**Files:**
- Create: `tests/e2e/growth-core.spec.ts`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `SECURITY.md`
- Modify: `docs/DATA_MODEL.md`
- Modify: `docs/TESTING.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/testing/2026-08-03-learning-goals-core-test-matrix.md`

- [ ] **Step 1: Write E2E scenarios**

Verify:

1. anonymous Growth routes redirect before private markers;
2. owner creates draft goal, checkpoints and skills;
3. derived mixed binary/numeric progress is correct;
4. stale version is rejected;
5. waiver requires confirmation/reason;
6. goal cannot complete before required checkpoints;
7. 360 × 800 has no horizontal overflow;
8. public homepage/output contains no Growth labels/data.

- [ ] **Step 2: Run focused gates**

```bash
pnpm check:boundaries
pnpm check:public-confidentiality
pnpm --filter @semogtw/domain exec vitest run src/growth
pnpm --filter @semogtw/database exec vitest run src/growth-migrations.test.ts src/repositories/*learning*.test.ts src/repositories/skill-repository.test.ts src/repositories/growth-read-model.test.ts
pnpm --filter @semogtw/web exec vitest run src/server/devos-growth*.test.ts src/components/devos/growth*.test.tsx
pnpm --filter @semogtw/web build
node scripts/prepare-e2e.mjs
pnpm exec playwright test tests/e2e/growth-core.spec.ts
```

- [ ] **Step 3: Run repository gates**

```bash
pnpm check
pnpm build
pnpm test:e2e
```

Record exact observed results; classify unavailable gates without claiming pass.

- [ ] **Step 4: Reconcile docs**

Document implementation state, migration list, privacy boundary, backup behavior and evidence that no direct percentage mutation exists.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/growth-core.spec.ts README.md ARCHITECTURE.md SECURITY.md docs CHANGELOG.md
git commit -m "docs: verify learning goals core"
git push
```

---

## Completion gate

This plan is complete only when goals, checkpoints and skills are canonical/private; progress is derived; every mutation is transactional/audited; backup/restore and public-confidentiality gates pass; and browser acceptance proves owner-only operation at desktop and 360 px.
