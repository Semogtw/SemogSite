# Semogtw Workflow and Recovery MCP Read Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the six provider-neutral, bounded, read-only workflow/recovery MCP tools approved by the remote MCP design without exposing database rows, introducing mutation tools or weakening branch/SHA/recovery safety rules.

**Architecture:** Extend the shared DevOS read-service boundary with dedicated workflow DTOs backed by existing orchestration read models and services. Register strict Zod output schemas and six tools in `packages/mcp`, then compose them in `apps/mcp`. Verify in-memory and SQLite protocol behavior first; authenticated HTTP and Gemini Spark verification occur only after the remote transport plan passes.

**Tech Stack:** TypeScript, Zod, SQLite/Drizzle read models, `@modelcontextprotocol/sdk` 1.x, Vitest, pnpm workspaces.

## Global Constraints

- Implement from the newest consolidated branch containing the workflow orchestration core and current MCP catalog.
- Follow Phase F of `docs/superpowers/specs/2026-08-03-semogtw-remote-mcp-spark-design.md`.
- Add exactly these tools:
  - `devos_get_workflow_summary`;
  - `devos_get_safe_next_work`;
  - `devos_list_scope_reservations`;
  - `devos_list_verification_obligations`;
  - `devos_get_recovery_snapshot`;
  - `devos_get_project_resume_context`.
- Add no MCP resources in this slice unless the canonical design is explicitly amended first.
- Add reads only. No acquire, renew, release, override, result recording, supersede, waiver, snapshot creation, branch acceptance, publication or GitHub-write tools.
- Reuse canonical domain/read services; never serialize raw database rows.
- Preserve the persisted accepted branch and full matching 40-character GitHub observation SHA.
- Never infer `completed` from commit silence, stale activity or absent heartbeats.
- Preserve explicit verification classifications: `code_failure`, `environment_missing`, `flaky`, `timeout`, `quota`, `configuration`, `external_dependency`, `unknown`.
- Safe-work capabilities default to an empty set and request-supplied capabilities are normalized but never persisted or treated as execution proof.
- Recovery output remains private, bounded and subject to unsafe-path/credential-shaped-content rejection.
- Every collection is bounded to at most 50 items, deterministically ordered and strict-schema validated.
- Preserve existing sensitive-key scanning and 256 KiB logical response limit.
- Keep `packages/mcp` transport/auth/database-free and `apps/mcp` listener-free.
- Commit after every independently reviewable task and push frequently.

---

## Planned file structure

```text
packages/domain/src/orchestration/mcp-workflow-read.ts
packages/domain/src/orchestration/mcp-workflow-read.test.ts
packages/domain/src/orchestration/index.ts
packages/domain/src/index.ts

packages/database/src/repositories/mcp-workflow-read-model.ts
packages/database/src/repositories/mcp-workflow-read-model.test.ts
packages/database/src/index.ts

packages/mcp/src/workflow-output-schemas.ts
packages/mcp/src/workflow-output-schemas.test.ts
packages/mcp/src/catalog.ts
packages/mcp/src/catalog.test.ts
packages/mcp/src/server.ts
packages/mcp/src/server.test.ts
packages/mcp/src/server-output-bounds.test.ts
packages/mcp/src/server-sensitive-output.test.ts

apps/mcp/src/sqlite-server.ts
apps/mcp/src/sqlite-server.test.ts

docs/testing/2026-08-03-workflow-mcp-read-catalog-test-matrix.md
MCP.md
README.md
ARCHITECTURE.md
SECURITY.md
CHANGELOG.md
```

---

### Task 1: Define provider-neutral workflow read DTOs and inputs

**Files:**
- Create: `packages/domain/src/orchestration/mcp-workflow-read.ts`
- Create: `packages/domain/src/orchestration/mcp-workflow-read.test.ts`
- Modify: `packages/domain/src/orchestration/index.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

```ts
export type WorkflowSummaryRead = {
  generatedAt: string;
  activeReservationCount: number;
  unresolvedVerificationCount: number;
  recentRecoverySnapshotCount: number;
  safeCandidateCount: number;
  exclusionCount: number;
};

export type ScopeReservationRead = {
  id: string;
  projectId: string | null;
  repositoryId: string;
  branch: string;
  scopeKind: "repository" | "directory" | "files" | "issue" | "stage" | "custom";
  normalizedPatterns: readonly string[];
  state: "active" | "released" | "transferred" | "overridden" | "expired";
  expiresAt: string;
  overlapReservationIds: readonly string[];
};

export type VerificationObligationRead = {
  id: string;
  projectId: string;
  repositoryId: string;
  branch: string;
  commitSha: string;
  command: string;
  state: "pending" | "running" | "passed" | "failed" | "blocked" | "superseded" | "waived";
  classification:
    | "code_failure"
    | "environment_missing"
    | "flaky"
    | "timeout"
    | "quota"
    | "configuration"
    | "external_dependency"
    | "unknown"
    | null;
  requiredCapabilities: readonly string[];
  nextAction: string;
  observedSummary: string | null;
};

export type RecoverySnapshotRead = {
  id: string;
  projectId: string;
  repositoryId: string;
  branch: string;
  commitSha: string;
  canonicalHash: string;
  createdAt: string;
  markdown: string | null;
};

export type ProjectResumeContextRead = {
  generatedAt: string;
  projectId: string;
  projectSlug: string;
  repositoryId: string | null;
  acceptedBranch: string | null;
  observedCommitSha: string | null;
  observedAt: string | null;
  evidenceState:
    | "verified"
    | "missing_repository"
    | "ambiguous_repository"
    | "missing_branch"
    | "missing_observation"
    | "stale_unknown";
  activityLabel: "reported_active" | "quiet" | "probably_ended" | "stale_unknown" | "waiting_user" | "blocked" | "completed" | "failed";
  activityBasis: string;
  currentStageId: string | null;
  currentStageTitle: string | null;
  nextAction: string | null;
  blockers: readonly string[];
  unresolvedVerificationObligationIds: readonly string[];
  conflictingReservationIds: readonly string[];
  latestRecoverySnapshotId: string | null;
};

export interface DevOSWorkflowReadService {
  getWorkflowSummary(): Promise<WorkflowSummaryRead>;
  getSafeNextWork(input: { capabilities: readonly string[] }): Promise<SafeWorkEvaluation>;
  listScopeReservations(input: {
    projectId?: string;
    repositoryId?: string;
    activeOnly: boolean;
    limit: number;
  }): Promise<readonly ScopeReservationRead[]>;
  listVerificationObligations(input: {
    projectId?: string;
    repositoryId?: string;
    unresolvedOnly: boolean;
    limit: number;
  }): Promise<readonly VerificationObligationRead[]>;
  getRecoverySnapshot(input: {
    id?: string;
    projectId?: string;
    includeMarkdown: boolean;
  }): Promise<RecoverySnapshotRead | null>;
  getProjectResumeContext(slug: string): Promise<ProjectResumeContextRead | null>;
}
```

- [ ] **Step 1: Write failing normalization tests**

Add helpers and tests for:

```ts
normalizeWorkflowReadLimit(undefined) === 20
normalizeWorkflowReadLimit(1) === 1
normalizeWorkflowReadLimit(50) === 50
normalizeWorkflowCapabilities([" Node ", "git", "node"]) === ["git", "node"]
```

Reject limit outside `1..50`, invalid identifiers, unsafe branch/SHA values and recovery requests that specify neither or both `id` and `projectId`.

- [ ] **Step 2: Write failing semantic tests**

Assert no inactivity-only fixture yields `completed`; full SHA is lowercase 40-character hex; ID/capability arrays are unique/sorted; recovery Markdown is optional and absent unless explicitly requested.

- [ ] **Step 3: Run and verify failure**

```bash
pnpm --filter @semogtw/domain exec vitest run src/orchestration/mcp-workflow-read.test.ts
```

- [ ] **Step 4: Implement the contracts/helpers**

Keep the module framework/database/MCP-SDK-free. Reuse existing `SafeWorkEvaluation` and canonical workflow enums when exported.

- [ ] **Step 5: Run checks and commit**

```bash
pnpm --filter @semogtw/domain exec vitest run src/orchestration/mcp-workflow-read.test.ts
pnpm --filter @semogtw/domain typecheck
pnpm check:boundaries
git add packages/domain
git commit -m "feat: define workflow MCP read contracts"
git push
```

---

### Task 2: Implement SQLite workflow read composition

**Files:**
- Create: `packages/database/src/repositories/mcp-workflow-read-model.ts`
- Create: `packages/database/src/repositories/mcp-workflow-read-model.test.ts`
- Modify: `packages/database/src/index.ts`

**Interfaces:**

```ts
export function createSqliteDevOSWorkflowReadService(
  database: SqliteDatabase,
  options?: { now?: () => string },
): DevOSWorkflowReadService;
```

- [ ] **Step 1: Write failing fixture tests**

Create isolated migrated databases covering:

- active, expired, released and overridden reservations;
- overlapping reservations;
- unresolved and terminal verification obligations;
- all explicit result classifications;
- accepted branch with matching full-SHA observation;
- accepted branch without matching observation;
- zero and multiple active repositories;
- first incomplete roadmap stage and later-stage exclusion;
- recovery snapshot history and credential/path protections;
- demonstration seed exclusion from safe work.

- [ ] **Step 2: Verify failure**

```bash
pnpm --filter @semogtw/database exec vitest run src/repositories/mcp-workflow-read-model.test.ts
```

- [ ] **Step 3: Implement by composing existing services**

Do not reimplement reservation expiration/overlap, verification classification, safe-work ranking or recovery canonicalization. Use existing read models/services and map to dedicated DTOs.

`getWorkflowSummary` derives counts at read time.

`getRecoverySnapshot` behavior:

- by `id`: return that private immutable snapshot;
- by `projectId`: return the newest snapshot for that project;
- `includeMarkdown=false`: return metadata with `markdown: null`;
- unknown target: return null;
- never return canonical JSON, unsafe paths or internal audit fields.

`getProjectResumeContext` behavior:

1. resolve canonical project slug;
2. require exactly one active repository for verified repository context;
3. use only persisted accepted branch;
4. use latest matching persisted observation;
5. expose missing/ambiguous evidence explicitly;
6. derive activity from existing source precedence and never from silence alone;
7. include first incomplete stage, blockers, gate IDs, conflict IDs and latest snapshot ID;
8. never substitute provider default branch or fabricate SHA/test/completion state.

- [ ] **Step 4: Run focused regression tests**

```bash
pnpm --filter @semogtw/database exec vitest run \
  src/repositories/mcp-workflow-read-model.test.ts \
  src/repositories/workflow-orchestration-read-model.test.ts \
  src/repositories/recovery-snapshot-read-model.test.ts \
  src/repositories/recovery-snapshot-source.test.ts \
  src/repositories/safe-work-source.test.ts
pnpm --filter @semogtw/database typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/database
git commit -m "feat: add SQLite workflow MCP reads"
git push
```

---

### Task 3: Add strict MCP output schemas

**Files:**
- Create: `packages/mcp/src/workflow-output-schemas.ts`
- Create: `packages/mcp/src/workflow-output-schemas.test.ts`
- Modify: `packages/mcp/src/index.ts`

**Interfaces:**

```ts
workflowSummaryOutputSchema
safeNextWorkOutputSchema
scopeReservationsOutputSchema
verificationObligationsOutputSchema
recoverySnapshotOutputSchema
projectResumeContextOutputSchema
```

- [ ] **Step 1: Write failing valid/invalid schema tests**

Valid canonical fixtures pass. Reject:

- abbreviated/nonhex SHA;
- unknown states/classifications;
- more than 50 list entries;
- duplicate/unsorted canonical arrays;
- extra database-only properties;
- nested `token`, `password`, `authorization`, `cookie`, `secret` or raw audit fields;
- oversized or credential-shaped recovery Markdown;
- `completed` resume context whose basis is only inactivity.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/mcp exec vitest run src/workflow-output-schemas.test.ts
```

- [ ] **Step 3: Implement strict bounded schemas**

Use `.strict()` objects and exact enums. Reuse shared schemas when they preserve the same allowlist; never use passthrough.

- [ ] **Step 4: Run checks and commit**

```bash
pnpm --filter @semogtw/mcp exec vitest run src/workflow-output-schemas.test.ts
pnpm --filter @semogtw/mcp typecheck
git add packages/mcp/src
git commit -m "feat: validate workflow MCP projections"
git push
```

---

### Task 4: Add exact catalog metadata for six tools

**Files:**
- Modify: `packages/mcp/src/catalog.ts`
- Modify: `packages/mcp/src/catalog.test.ts`

**Interfaces:**

Add exactly:

```text
devos_get_workflow_summary             structured key: workflowSummary
devos_get_safe_next_work               structured key: safeNextWork
devos_list_scope_reservations          structured key: reservations
devos_list_verification_obligations    structured key: verificationObligations
devos_get_recovery_snapshot            structured key: recoverySnapshot
devos_get_project_resume_context       structured key: resumeContext
```

- [ ] **Step 1: Update exact-catalog tests first**

Assert original resources/five tools remain and exactly six tools are added. Assert no new resource URI, no duplicate names/keys and all tools use existing read-only annotations.

- [ ] **Step 2: Run and observe failure**

```bash
pnpm --filter @semogtw/mcp exec vitest run src/catalog.test.ts
```

- [ ] **Step 3: Add provider-neutral descriptions**

Descriptions must state observed private reads and must not claim live agent status, completion or mutation.

- [ ] **Step 4: Run checks and commit**

```bash
pnpm --filter @semogtw/mcp exec vitest run src/catalog.test.ts
pnpm --filter @semogtw/mcp typecheck
git add packages/mcp/src/catalog.ts packages/mcp/src/catalog.test.ts
git commit -m "feat: define workflow MCP tool catalog"
git push
```

---

### Task 5: Register the six tool handlers

**Files:**
- Modify: `packages/mcp/src/server.ts`
- Modify: `packages/mcp/src/server.test.ts`
- Modify: `packages/mcp/src/server-output-bounds.test.ts`
- Modify: `packages/mcp/src/server-sensitive-output.test.ts`
- Modify: `packages/mcp/src/server-output-validation.test.ts`

**Interfaces:**

Extend the service dependency:

```ts
export type SemogtwMcpReadService = ExistingSemogtwMcpReadService & DevOSWorkflowReadService;
```

Tool inputs:

```ts
workflow summary: {}
safe next work: { capabilities?: string[] }
reservations: { projectId?: string; repositoryId?: string; activeOnly?: boolean; limit?: number }
obligations: { projectId?: string; repositoryId?: string; unresolvedOnly?: boolean; limit?: number }
recovery snapshot: { id?: string; projectId?: string; includeMarkdown?: boolean }
resume context: { slug: string }
```

Stable expected errors:

```text
WORKFLOW_INVALID_INPUT
RECOVERY_SNAPSHOT_NOT_FOUND
RESUME_CONTEXT_NOT_FOUND
```

Unexpected failures remain `DEVOS_READ_FAILED`.

- [ ] **Step 1: Write failing discovery/call tests**

Call every new tool with valid/invalid inputs and assert exact structured key/content parity. Unknown snapshot/project returns stable expected error; no thrown message is exposed.

- [ ] **Step 2: Add default-safety tests**

Assert safe-work missing capabilities becomes `[]`; recovery missing `includeMarkdown` becomes `false`; default limits are 20; capabilities are not persisted; list outputs never exceed 50.

- [ ] **Step 3: Add bound/sensitive-output tests**

Synthetic oversized projections return `RESULT_TOO_LARGE`; nested sensitive keys return `SENSITIVE_OUTPUT_REJECTED`; malformed output returns `DEVOS_READ_FAILED`.

- [ ] **Step 4: Run and observe failure**

```bash
pnpm --filter @semogtw/mcp exec vitest run \
  src/server.test.ts \
  src/server-output-bounds.test.ts \
  src/server-sensitive-output.test.ts \
  src/server-output-validation.test.ts
```

- [ ] **Step 5: Implement using existing helpers**

Reuse the existing registration, `guardedTool`, `toolSuccess`, `toolFailure`, serialization, sensitive scan and 256 KiB limit. Do not create a second response/error path.

- [ ] **Step 6: Run checks and commit**

```bash
pnpm --filter @semogtw/mcp test
pnpm --filter @semogtw/mcp typecheck
git add packages/mcp/src
git commit -m "feat: expose workflow MCP read tools"
git push
```

---

### Task 6: Compose workflow reads in `apps/mcp`

**Files:**
- Modify: `apps/mcp/src/sqlite-server.ts`
- Modify: `apps/mcp/src/sqlite-server.test.ts`

**Interfaces:**

Keep the public factory signature unchanged:

```ts
createSqliteSemogtwMcpServer(database: SqliteDatabase): McpServer
```

It composes original and workflow read services behind one explicit delegate object.

- [ ] **Step 1: Extend SQLite protocol tests first**

Discover/call all six tools against migrated fixtures. Verify exact accepted branch/full SHA. Remove matching observation and verify explicit missing evidence. Verify recovery Markdown remains absent by default and present only with `includeMarkdown: true`.

- [ ] **Step 2: Run and observe failure**

```bash
pnpm --filter @semogtw/mcp-app exec vitest run src/sqlite-server.test.ts
```

- [ ] **Step 3: Implement composition**

Create `createSqliteDevOSWorkflowReadService(database)` and delegate methods. Never pass database into `packages/mcp` or add a listener.

- [ ] **Step 4: Run checks and commit**

```bash
pnpm --filter @semogtw/mcp-app test
pnpm --filter @semogtw/mcp-app typecheck
pnpm check:mcp-package-boundaries
pnpm check:mcp-node-runtime-boundary
git add apps/mcp
git commit -m "feat: compose workflow MCP reads"
git push
```

---

### Task 7: Verify authenticated HTTP parity

**Files:**
- Modify: `apps/mcp-http/src/remote-mcp.integration.test.ts` when the remote plan exists
- Create: `docs/testing/2026-08-03-workflow-mcp-read-catalog-test-matrix.md`

- [ ] **Step 1: Gate on the remote transport**

If `apps/mcp-http` is absent or its protocol/auth integration test is not passing, mark this task `blocked/dependency` and do not create an unauthenticated temporary listener.

- [ ] **Step 2: Add authenticated official-client calls**

Call all six tools through Streamable HTTP and compare logical structured output with direct in-process service output.

- [ ] **Step 3: Prove authorization precedes workflow reads**

Missing/invalid/revoked/wrong-resource token, missing scope, bad Host/Origin and oversized input must not call workflow services.

- [ ] **Step 4: Verify two-client isolation and no mutation**

Separate clients cannot share auth/MCP context. Compare workflow/audit tables before and after reads; no mutation attributable to tool calls is allowed.

- [ ] **Step 5: Run and commit**

```bash
pnpm --filter @semogtw/mcp-http exec vitest run src/remote-mcp.integration.test.ts
git add apps/mcp-http/src/remote-mcp.integration.test.ts docs/testing/2026-08-03-workflow-mcp-read-catalog-test-matrix.md
git commit -m "test: verify workflow MCP reads remotely"
git push
```

---

### Task 8: Verify Gemini Spark Phase F compatibility

**Files:**
- Modify: `docs/testing/2026-08-03-gemini-spark-mcp-acceptance.md`
- Modify: `docs/testing/2026-08-03-workflow-mcp-read-catalog-test-matrix.md`

- [ ] **Step 1: Gate on observed Phase 1 Spark success**

Do not attribute workflow-tool failure to code until Spark has already discovered/called the original catalog on the same endpoint/version. If custom apps are unavailable, mark `external_dependency`.

- [ ] **Step 2: Run six read-only calls**

Verify workflow summary, safe next work with empty and explicit capabilities, bounded reservations, bounded obligations, recovery metadata/body opt-in and resume context.

- [ ] **Step 3: Run recommended read-only workflows**

Examples:

```text
Combine Calendar/Gmail/Tasks with DevOS workflow summary and safe next work; return a briefing only.
Show blocked verification obligations requiring owner action; do not change DevOS.
Generate project resume context from persisted evidence; identify missing evidence explicitly.
```

- [ ] **Step 4: Verify privacy and no mutation**

Confirm no Google credentials reach MCP logs, no raw provider content becomes instructions, and no DevOS mutation/event rows are created.

- [ ] **Step 5: Record and commit exact evidence**

```bash
git add docs/testing/2026-08-03-gemini-spark-mcp-acceptance.md docs/testing/2026-08-03-workflow-mcp-read-catalog-test-matrix.md
git commit -m "docs: record Spark workflow MCP acceptance"
git push
```

---

### Task 9: Reconcile canonical documentation and final gates

**Files:**
- Modify: `MCP.md`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `SECURITY.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/superpowers/plans/README.md`
- Modify: `docs/testing/2026-08-03-workflow-mcp-read-catalog-test-matrix.md`

- [ ] **Step 1: Document exact catalog contracts**

List the six tool names, inputs, defaults, structured keys, limits and expected errors. State that no new resources or write tools were added.

- [ ] **Step 2: Run focused gates**

```bash
pnpm --filter @semogtw/domain exec vitest run src/orchestration/mcp-workflow-read.test.ts
pnpm --filter @semogtw/database exec vitest run src/repositories/mcp-workflow-read-model.test.ts
pnpm --filter @semogtw/mcp test
pnpm --filter @semogtw/mcp-app test
pnpm --filter @semogtw/domain typecheck
pnpm --filter @semogtw/database typecheck
pnpm --filter @semogtw/mcp typecheck
pnpm --filter @semogtw/mcp-app typecheck
pnpm test:guardrails
```

- [ ] **Step 3: Run aggregate gates**

```bash
pnpm check
pnpm build
```

Run authenticated remote integration when available. Run `pnpm test:e2e` when web/shared private surface changes are included. Record exact counts/head.

- [ ] **Step 4: Inspect forbidden exposure**

```bash
git diff --check
git grep -nE 'execute_shell|raw_sql|generic_proxy|write_github|create_scope_reservation|record_verification_result|create_recovery_snapshot' -- packages/mcp apps/mcp packages/domain packages/database
```

Expected: no mutation/generic-access tool registration.

- [ ] **Step 5: Commit and push**

```bash
git add MCP.md README.md ARCHITECTURE.md SECURITY.md CHANGELOG.md docs
git commit -m "docs: finalize workflow MCP read catalog"
git push
```

- [ ] **Step 6: Open a focused pull request**

Target the newest consolidated branch. Include exact catalog delta, focused/aggregate tests, authenticated HTTP status, Spark status, privacy review and explicit statement that no MCP write tool/resource was added.

---

## Deferred work

Separate approved specifications/plans are required for:

- reservation acquire/renew/release/override;
- verification result/supersede/waiver;
- recovery snapshot creation;
- branch acceptance or project-state mutations;
- prompt launching/submission or browser automation;
- direct GitHub writes;
- stateful MCP sessions, notifications, sampling or background execution.
