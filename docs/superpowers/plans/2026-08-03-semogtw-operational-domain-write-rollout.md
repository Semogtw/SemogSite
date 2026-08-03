# Semogtw Operational Domain Write Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate every currently supported Projects, Roadmap, Attention, repository-target and workflow-orchestration mutation to canonical commands and expose only reviewed, resource-scoped MCP write tools with equivalent owner UI behavior.

**Architecture:** Use the existing domain services/repositories as business-rule sources. Add thin command adapters, previews and manifests per mutation; browser server functions and MCP tools call the same Command Gateway. High-impact transitions use approvals/change sets, while low/medium edits use direct/confirmation policy. No new generic entity patch or raw GitHub write path is introduced.

**Tech Stack:** Existing `@semogtw/domain`, `@semogtw/application`, `@semogtw/database`, `@semogtw/mcp`, TanStack Start/Router, Zod, Vitest, Playwright.

## Global Constraints

- Implement after Command Gateway, agent authorization and approvals/change sets pass.
- Start from the current `EDITABILITY_COVERAGE.md`; inspect code again and do not assume this plan’s catalog is exhaustive if new operational mutations landed.
- Existing domain services own transitions, evidence, audit/event semantics and invariants.
- No arbitrary `update fields`, JSON Patch, SQL, generic GitHub, shell, filesystem or HTTP tool.
- UI and MCP must produce equivalent canonical results/conflicts/audit while using channel-appropriate UX.
- Resource scope is resolved from canonical IDs before private state is returned.
- Public visibility/public copy changes are at least high risk; private ordinary metadata edits are low/medium.
- Stage completion stays approval-driven and exact evidence/version bound.
- Workflow reservations and verification evidence reuse existing orchestration services/tables.
- GitHub remains observational; these tools never create branches, commits, issues, PRs or repository settings.
- Soft archive/restore is preferred; permanent purge remains critical and outside this rollout unless separately specified.
- Every command has strict input/output bounds, idempotency, conflict strategy, preview/undo behavior and manifest coverage.
- Existing read tools remain unchanged and available when writes are disabled.
- Commit and push after every independently reviewable task.

## Planned command catalog

```text
projects.create
projects.update
projects.archive
projects.restore
roadmap.stages.create
roadmap.stages.update
roadmap.stages.reorder
roadmap.stages.complete
attention.transition
repository_targets.register
repository_targets.update_policy
repository_targets.archive
repository_targets.restore
workflow.reservations.acquire
workflow.reservations.release
workflow.verification.record_result
workflow.recovery.capture_snapshot
```

Task 1 must reconcile this catalog against current code. Remove commands for nonexistent product behavior; add commands for observed supported mutations in the same inventory commit. Do not invent a domain capability merely to fill a name.

## Planned files

```text
packages/application/src/projects/
packages/application/src/roadmap/
packages/application/src/attention/
packages/application/src/repository-targets/
packages/application/src/workflow/
packages/database/src/composition/operational-command-registry.ts
packages/database/src/composition/operational-command-registry.test.ts
packages/mcp/src/operational-write-tools.ts
packages/mcp/src/operational-write-tools.test.ts
apps/web/src/server/devos-project-mutations.ts
apps/web/src/server/devos-roadmap-mutations.ts
apps/web/src/server/devos-repository-target-mutations.ts
apps/web/src/server/devos-workflow-mutations.ts
tests/e2e/operational-domain-write-parity.spec.ts
docs/testing/2026-08-03-operational-domain-write-test-matrix.md
```

### Task 1: Freeze the operational mutation inventory and risk matrix

**Files:**
- Create: `docs/testing/2026-08-03-operational-domain-write-test-matrix.md`
- Modify: `docs/architecture/EDITABILITY_COVERAGE.md`
- Modify: `docs/superpowers/plans/2026-08-03-semogtw-agent-editability-plan-stack.md`

- [ ] Inspect current server functions, API routes, domain services, repository writes and MCP catalog.

```bash
git fetch --all --prune
git rev-parse HEAD
rg -n "createServerFn\(\{ method: \"POST\"|transitionWithAudit|WithAudit\(" apps/web/src/server packages/domain packages/database
rg -n "ProjectService|StageCompletionService|AttentionLifecycleService|RepositoryTarget|ScopeReservation|VerificationObligation|RecoverySnapshot" packages apps
```

- [ ] Build one coverage row per mutation with command ID/version, capability, resource kind, risk floor/escalation, expected-state strategy, preview, compensation, UI route, MCP tool and current implementation state.
- [ ] Verify every command ID follows the canonical registry convention and every existing mutation is either mapped or explicitly marked historical/superseded.
- [ ] Run current relevant tests and record exact results.

```bash
pnpm check:editability-coverage
pnpm --filter @semogtw/domain test
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/web test
pnpm --filter @semogtw/mcp test
```

- [ ] Commit.

```bash
git add docs/testing/2026-08-03-operational-domain-write-test-matrix.md docs/architecture/EDITABILITY_COVERAGE.md docs/superpowers/plans/2026-08-03-semogtw-agent-editability-plan-stack.md
git commit -m "docs: inventory operational command rollout"
git push
```

### Task 2: Implement project commands and owner parity

**Files:**
- Create: `packages/application/src/projects/project-commands.ts`
- Create: `packages/application/src/projects/project-commands.test.ts`
- Modify: current project domain service/repository composition.
- Modify: owner project mutation server functions/components confirmed in Task 1.

**Interfaces:**

```ts
export const CreateProjectInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  privateSummary: z.string().trim().max(5000).nullable(),
  priority: z.enum(["low", "medium", "high", "critical"]),
});

export const UpdateProjectInputSchema = z.object({
  projectId: z.string().min(1).max(200),
  expectedVersion: z.number().int().nonnegative(),
  name: z.string().trim().min(1).max(160).optional(),
  privateSummary: z.string().trim().max(5000).nullable().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  publicSummary: z.string().trim().max(3000).nullable().optional(),
  visibility: z.enum(["private", "unlisted", "public"]).optional(),
});
```

Risk:

```text
create private project → medium
private metadata update → low/medium
publicSummary/visibility change → high
archive/restore → medium
```

Rules:

- slug/ID generated server-side;
- empty update rejected;
- public fields use existing publication/public DTO validation and preview exact public effect;
- archive/restore preserve history/relations;
- no permanent delete.

- [ ] Write failing command tests for schemas, resources, dynamic risk, expected version, domain mapping, preview and audit output.
- [ ] Implement thin adapters over canonical project services.
- [ ] Migrate owner server functions to the gateway; browser never supplies principal/command/risk.
- [ ] Run focused tests/typecheck/confidentiality.

```bash
pnpm --filter @semogtw/application test -- project-commands
pnpm --filter @semogtw/database test -- project
pnpm --filter @semogtw/web test -- project
pnpm check:public-confidentiality
```

- [ ] Commit and push.

### Task 3: Implement roadmap stage create/update/reorder commands

**Files:**
- Create: `packages/application/src/roadmap/stage-commands.ts`
- Create: `packages/application/src/roadmap/stage-commands.test.ts`
- Modify current roadmap services/repositories/server functions/components.

**Interfaces:**

```ts
export const CreateStageInputSchema = z.object({
  projectId: z.string().min(1).max(200),
  expectedProjectVersion: z.number().int().nonnegative(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000),
  nextStep: z.string().trim().min(1).max(1000),
  insertAfterStageId: z.string().min(1).max(200).nullable(),
});

export const UpdateStageInputSchema = z.object({
  stageId: z.string().min(1).max(200),
  expectedVersion: z.number().int().nonnegative(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).optional(),
  nextStep: z.string().trim().min(1).max(1000).optional(),
  status: z.enum(["planned", "in_progress", "blocked", "cancelled"]).optional(),
  blocker: z.string().trim().max(2000).nullable().optional(),
});

export const ReorderStagesInputSchema = z.object({
  projectId: z.string().min(1).max(200),
  expectedProjectVersion: z.number().int().nonnegative(),
  orderedStageIds: z.array(z.string().min(1).max(200)).min(1).max(200),
});
```

Risk:

```text
create/update ordinary stage → medium
reorder → medium; high when >20 stages or active dependencies affected
completion → existing high approval flow
```

- [ ] Write failing tests for contiguous order, duplicate/missing/foreign stage IDs, blocked invariant, next-step invariant, risk escalation and atomic reorder.
- [ ] Implement commands through existing roadmap services; do not set derived project progress directly.
- [ ] Migrate guided owner UI; normal UI uses cards/drag/order controls, not raw sequence fields.
- [ ] Verify existing completion approval remains canonical.
- [ ] Run tests and commit.

### Task 4: Complete attention command parity

**Files:**
- Modify: `packages/application/src/attention/transition-attention-command.ts`
- Modify current attention web components/server tests.
- Create MCP tool tests in the shared operational tool file.

- [ ] Reconcile `attention.transition` from the Command Gateway pilot with current domain actions/statuses.
- [ ] Add canonical resource parent references when attention belongs to a project/stage.
- [ ] Verify owner UI and MCP use the same command, confirmation and idempotency result.
- [ ] Add compensation/undo statement: resolved/dismissed correction uses a new audited transition only when domain permits; history is never rewritten.
- [ ] Run focused tests and commit.

### Task 5: Implement repository-target lifecycle commands without GitHub writes

**Files:**
- Create: `packages/application/src/repository-targets/repository-target-commands.ts`
- Create: corresponding tests.
- Modify existing repository-target services/composition/UI.

Commands/risk:

```text
repository_targets.register       medium/high
repository_targets.update_policy  high; critical if broadening private repositories/branches
repository_targets.archive        medium
repository_targets.restore        medium
```

Inputs use canonical owner/name, accepted branch, visibility/private status and reviewed observation IDs. They never contain GitHub tokens or cause provider mutation.

- [ ] Write failing tests for owner/repository/branch normalization, exact observation binding, duplicate target, policy broadening risk and no provider write port invocation.
- [ ] Implement command adapters and high/critical previews.
- [ ] Migrate owner UI through gateway.
- [ ] Run GitHub read-only boundary tests and commit.

### Task 6: Implement workflow reservation commands

**Files:**
- Create: `packages/application/src/workflow/reservation-commands.ts`
- Create: tests.
- Modify existing orchestration composition/UI.

**Interfaces:**

```ts
export const AcquireReservationInputSchema = z.object({
  repositoryTargetId: z.string().min(1).max(200),
  branch: z.string().min(1).max(240),
  scopeKind: z.enum(["file", "directory", "migration", "domain"]),
  scopeRef: z.string().min(1).max(500),
  ownerRunId: z.string().min(1).max(200),
  ttlMinutes: z.number().int().min(5).max(480),
  reason: z.string().trim().min(1).max(500),
});
```

Risk:

```text
non-overlapping acquire/release → medium
approved overlap override/migration scope → high
broad domain/repository reservation → high
```

- [ ] Write tests for canonical path/scope, overlap, expiry, ownership, release, override approval and idempotency.
- [ ] Adapt existing `ScopeReservationService`; no duplicate table/service.
- [ ] Expose guided owner actions and specific MCP tools.
- [ ] Run orchestration/run-ledger guardrails and commit.

### Task 7: Implement verification-result and recovery-snapshot commands

**Files:**
- Create: `packages/application/src/workflow/verification-recovery-commands.ts`
- Create: tests.
- Modify existing orchestration/recovery composition/UI.

Commands:

```text
workflow.verification.record_result
workflow.recovery.capture_snapshot
```

Rules:

- result exact obligation/request/repository/branch/40-char SHA;
- passed requires observed deterministic gate result and null failure classification;
- failed/blocked classifications remain distinct;
- command/summary/artifact refs bounded and secret scanned;
- model/client statement alone cannot record passed;
- snapshot uses accepted branch/current observation and does not infer completion from silence;
- snapshot is immutable; correction creates a newer snapshot.

- [ ] Write failing exact-SHA/classification/staleness/immutable tests.
- [ ] Implement using existing services/tables.
- [ ] Add high risk for gate waiver/override; this rollout records results only and does not add waiver unless already supported and separately approved.
- [ ] Run focused tests and commit.

### Task 8: Compose the operational command registry and previews

**Files:**
- Create: `packages/database/src/composition/operational-command-registry.ts`
- Create: corresponding integration tests.
- Modify command gateway composition/manifests/coverage.

- [ ] Register the reconciled catalog with transaction-bound repositories/services.
- [ ] Add allowlisted previews for public project effects, stage reorder/completion, target policy broadening and reservation conflicts.
- [ ] Prove domain mutation, domain event/audit and receipt/change-set transaction behavior.
- [ ] Prove high/critical commands do not execute without approvals/current authorization.
- [ ] Run application/database/editability tests and commit.

### Task 9: Expose specific filtered MCP operational tools

**Files:**
- Create: `packages/mcp/src/operational-write-tools.ts`
- Create: corresponding tests.
- Modify MCP catalog/composition only after remote write gates pass.

Tool names map one-to-one to commands, for example:

```text
devos_create_project
devos_update_project
devos_archive_project
devos_create_roadmap_stage
devos_update_roadmap_stage
devos_reorder_roadmap_stages
devos_complete_roadmap_stage
devos_transition_attention
devos_register_repository_target
devos_update_repository_target_policy
devos_acquire_scope_reservation
devos_release_scope_reservation
devos_record_verification_result
devos_capture_recovery_snapshot
```

- [ ] Write tests for scope/capability/resource filtering, confirmation/approval, strict schemas, idempotency, revocation/switches and bounded outputs.
- [ ] Verify no generic command executor and no GitHub write method enters discovery.
- [ ] Implement only after prerequisite read/write gates are green.
- [ ] Run MCP boundary/protocol tests and commit.

### Task 10: Verify UI/MCP parity and public confidentiality E2E

**Files:**
- Create: `tests/e2e/operational-domain-write-parity.spec.ts`
- Modify test matrix, coverage, MCP/security/runbook/changelog docs.

Scenarios include:

1. create/update/archive/restore private project through UI and authorized MCP;
2. public visibility change requires approval and updates only allowlisted public DTO;
3. create/update/reorder stage; direct percentage remains impossible;
4. stage completion remains approval/evidence bound;
5. attention transition is idempotent across channels;
6. target policy broadening escalates and never writes GitHub;
7. reservation conflict/override policy;
8. exact-SHA verification result and immutable recovery snapshot;
9. revoke/pause writes while reads continue;
10. anonymous/public output contains no private project/workflow/command metadata;
11. 360 px owner flows remain usable.

Run:

```bash
pnpm check:editability-coverage
pnpm check:run-ledger-guardrails
pnpm check:public-confidentiality
pnpm check:mcp-package-boundaries
pnpm --filter @semogtw/application test
pnpm --filter @semogtw/domain test
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/mcp test
pnpm --filter @semogtw/web test
pnpm --filter @semogtw/web typecheck
pnpm --filter @semogtw/web build
pnpm exec playwright test tests/e2e/operational-domain-write-parity.spec.ts
```

Update documentation with implemented command/tool inventory and observed evidence, linking canonical specs instead of copying them.

## Acceptance criteria

- every observed supported operational mutation is covered or explicitly historical;
- project, roadmap, attention, target and workflow writes use canonical commands;
- browser/MCP parity, idempotency, conflicts, audit and risk behavior pass;
- public effects are previewed/approved and public DTOs remain allowlisted;
- no direct percentage, raw DB, generic mutation or GitHub write tool exists;
- workflow services/tables are reused rather than duplicated;
- write pause/revocation preserves reads;
- E2E, boundary and confidentiality gates pass.
