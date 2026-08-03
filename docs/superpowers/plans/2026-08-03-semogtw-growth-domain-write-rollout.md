# Semogtw Growth Domain Write Rollout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose complete owner and authorized-AI workflows for learning goals, checkpoints, skills, evidence and credentials while preserving derived progress and evidence-based verification.

**Architecture:** Add strict command adapters over the existing Growth/evidence/credential services and persistence from migrations `0015`–`0016`. Browser flows and MCP tools share the Command Gateway. Routine proposals/metadata edits use low/medium policy; evidence acceptance, waivers, verification and goal completion use previews/approvals according to risk. No tool writes a percentage directly.

**Tech Stack:** Existing Growth domain/database/UI, `@semogtw/application`, approvals/change sets, `@semogtw/mcp`, Zod, Vitest, Playwright.

## Global Constraints

- Implement after Growth core/evidence/credentials, adaptive owner UX, Command Gateway, agent authorization and approvals pass.
- Reconcile the implemented Growth model before coding; do not create parallel goal/checkpoint/evidence/credential types or tables.
- Goal progress is always derived from checkpoint weights and accepted binary/numeric state.
- No API/UI/MCP input accepts direct goal percentage or arbitrary skill proficiency score.
- AI/external clients may propose evidence/claims/credentials; unreviewed output never affects canonical progress or verification.
- LLM classification, email subject, commit text, keywords and file extensions never auto-accept evidence.
- Deterministic auto-accept remains limited to the narrow policies defined by the Growth specification.
- Accepted evidence, credential verification, checkpoint waiver and goal completion are audited guarded transitions.
- External provider/Gmail/GitHub content remains untrusted and normalized/bounded.
- Credential files remain private storage references; no raw mailbox body/token/file bytes in MCP or ordinary logs.
- Archive/reject/supersede preserve history; no destructive delete in this rollout.
- Owner UI remains guided/progressive and usable without any AI provider.
- Every command has resource/risk/idempotency/conflict/preview/undo/manifest behavior.
- Remote write tools remain undiscoverable until their global/domain/client switches and prerequisite gates pass.
- Commit and push after each independently reviewable task.

## Planned command catalog

```text
growth.goals.create
growth.goals.update
growth.goals.activate
growth.goals.pause
growth.goals.complete
growth.goals.cancel
growth.goals.archive
growth.goals.restore
growth.checkpoints.create
growth.checkpoints.update
growth.checkpoints.reorder
growth.checkpoints.record_value
growth.checkpoints.waive
growth.checkpoints.cancel
growth.skills.create
growth.skills.update
growth.skills.merge
growth.skills.archive
growth.links.goal_skill.update
growth.links.checkpoint_skill.update
growth.links.goal_repository.update
growth.evidence.propose
growth.evidence.accept
growth.evidence.reject
growth.evidence.supersede
growth.credentials.create
growth.credentials.update
growth.credentials.verify
growth.credentials.revoke
growth.credentials.reject
```

Task 1 reconciles this catalog with implemented services and removes/adds only genuinely supported operations.

## Planned files

```text
packages/application/src/growth/
  goal-commands.ts
  checkpoint-commands.ts
  skill-link-commands.ts
  evidence-commands.ts
  credential-commands.ts
  previews.ts
  manifests.ts
  *.test.ts
packages/database/src/composition/growth-command-registry.ts
packages/database/src/composition/growth-command-registry.test.ts
packages/mcp/src/growth-write-tools.ts
packages/mcp/src/growth-write-tools.test.ts
apps/web/src/server/devos-growth-mutations.ts
apps/web/src/server/devos-growth-evidence-mutations.ts
apps/web/src/server/devos-growth-credential-mutations.ts
tests/e2e/growth-domain-write-parity.spec.ts
docs/testing/2026-08-03-growth-domain-write-test-matrix.md
```

### Task 1: Freeze Growth mutation/risk coverage

**Files:**
- Create: `docs/testing/2026-08-03-growth-domain-write-test-matrix.md`
- Modify: `docs/architecture/EDITABILITY_COVERAGE.md`
- Modify: `docs/superpowers/plans/2026-08-03-semogtw-agent-editability-plan-stack.md`

- [ ] Inspect implemented Growth server functions/services/repositories/routes and current read MCP catalog.

```bash
git fetch --all --prune
git rev-parse HEAD
rg -n "LearningGoal|LearningCheckpoint|EvidenceCandidate|EvidenceClaim|LearningCredential|SkillStage|devos.growth" packages apps tests docs
rg -n "createServerFn\(\{ method: \"POST\"|WithAudit\(" apps/web/src/server packages/domain/src/growth packages/database/src
```

- [ ] Build a row for every supported mutation with command/tool/UI/risk/expected-version/preview/compensation/provenance.
- [ ] Mark nonexistent catalog entries as removed from the plan; add newly implemented mutations only with the same analysis.
- [ ] Confirm migrations `0015`–`0016` are canonical and note any strictly necessary additive schema change before creating one.
- [ ] Run and record current exact-head Growth/domain/database/web/MCP tests.
- [ ] Commit inventory.

### Task 2: Implement goal lifecycle commands

**Files:**
- Create: `packages/application/src/growth/goal-commands.ts`
- Create: corresponding tests.
- Modify implemented Growth goal service/composition/browser handlers.

**Key interfaces:**

```ts
export const CreateLearningGoalInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(5000),
  motivation: z.string().trim().max(1000).nullable(),
  priority: z.enum(["low", "medium", "high", "critical"]),
  targetDate: z.string().date().nullable(),
  templateId: z.string().min(1).max(120).nullable(),
});

export const UpdateLearningGoalInputSchema = z.object({
  goalId: z.string().min(1).max(200),
  expectedVersion: z.number().int().nonnegative(),
  title: z.string().trim().min(1).max(160).optional(),
  description: z.string().trim().max(5000).optional(),
  motivation: z.string().trim().max(1000).nullable().optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).optional(),
  targetDate: z.string().date().nullable().optional(),
});
```

Risk:

```text
create/update draft/private metadata → low/medium
activate/pause/cancel/archive/restore → medium
complete → high, requires derived 100% plus required checkpoint/evidence validation
```

- [ ] Write failing schema/resource/risk/lifecycle/idempotency/conflict tests.
- [ ] Reuse deterministic quick-create/template service; template origin remains template, not AI.
- [ ] Implement completion preview showing checkpoint basis and unmet requirements; never accept a percentage input.
- [ ] Migrate owner handlers through the gateway.
- [ ] Run focused tests and commit.

### Task 3: Implement checkpoint commands and automatic-weight behavior

**Files:**
- Create: `packages/application/src/growth/checkpoint-commands.ts`
- Create: corresponding tests.
- Modify checkpoint/weight services/browser UI.

Inputs support title/description/required/order/weight mode/completion mode/target/unit/due date/current accepted value only through the appropriate command.

Risk:

```text
create/update/reorder ordinary checkpoint → medium
record owner numeric/binary value → medium
change targets/weights after accepted evidence → high
waive required checkpoint → high
cancel → medium/high according to accepted evidence impact
```

Rules:

- automatic weights come from the deterministic service and total exactly 100;
- custom weights are not silently rewritten;
- reorder uses complete exact ID list and expected goal version;
- numeric target/value positive/bounded and ratio clamped only in derived projection;
- completion/waiver/history remains audited;
- MCP cannot call a lower-level percentage setter because none exists.

- [ ] Write failing weight/reorder/value/waiver/stale-evidence tests.
- [ ] Implement commands/previews/change-set support.
- [ ] Migrate guided owner UI and advanced settings through gateway.
- [ ] Run tests and commit.

### Task 4: Implement skills and canonical link commands

**Files:**
- Create: `packages/application/src/growth/skill-link-commands.ts`
- Create: tests.
- Modify skill/link services/UI.

Commands cover skill create/update/merge/archive and exact replacement/update of goal-skill, checkpoint-skill and goal-repository links.

Rules:

- skill slug/alias normalization server-side;
- merge preserves historical IDs/links and points to canonical skill;
- `demonstrated` is an evidence-derived projection, not directly writable;
- desired checkpoint skill stage may be edited; achieved stage cannot be manually asserted without accepted evidence;
- repository link resolves existing approved repository target; it never registers or writes GitHub;
- bulk link replacement uses a change set and exact expected versions.

- [ ] Write failing alias/merge/cycle/link/resource/risk tests.
- [ ] Implement through canonical services.
- [ ] Migrate owner UI and run tests/commit.

### Task 5: Implement evidence proposal/review commands

**Files:**
- Create: `packages/application/src/growth/evidence-commands.ts`
- Create: corresponding tests.
- Modify evidence services/repositories/UI.

**Interfaces:**

```ts
export const EvidenceClaimInputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("checkpoint_progress"),
    checkpointId: z.string().min(1).max(200),
    proposedValue: z.number().finite().nonnegative(),
    basis: z.string().trim().min(1).max(2000),
    confidence: z.enum(["high", "medium", "low", "unknown"]),
  }),
  z.object({
    kind: z.literal("checkpoint_completion"),
    checkpointId: z.string().min(1).max(200),
    basis: z.string().trim().min(1).max(2000),
    confidence: z.enum(["high", "medium", "low", "unknown"]),
  }),
  z.object({
    kind: z.literal("skill_stage"),
    skillId: z.string().min(1).max(200),
    proposedStage: z.enum(["introduced", "practicing", "applied", "demonstrated"]),
    basis: z.string().trim().min(1).max(2000),
    confidence: z.enum(["high", "medium", "low", "unknown"]),
  }),
  z.object({
    kind: z.literal("goal_context"),
    goalId: z.string().min(1).max(200),
    basis: z.string().trim().min(1).max(2000),
    confidence: z.enum(["high", "medium", "low", "unknown"]),
  }),
]);

export const ProposeEvidenceInputSchema = z.object({
  sourceKind: z.enum([
    "manual",
    "github_commit",
    "github_pull_request",
    "github_workflow",
    "certificate",
    "course",
    "assessment",
    "project",
    "external_agent",
  ]),
  sourceRef: z.string().trim().min(1).max(500),
  observedAt: z.string().datetime(),
  title: z.string().trim().min(1).max(300),
  neutralSummary: z.string().trim().max(2000),
  metadata: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
  claims: z.array(EvidenceClaimInputSchema).min(1).max(50),
});
```

Risk:

```text
propose → low
reject/supersede → medium
accept ordinary evidence → high unless a reviewed deterministic auto-accept policy authorizes it
accept completion/skill-stage/credential effects → high
```

Rules:

- authenticated client/provenance is server-derived, not accepted from input;
- exact GitHub refs bind approved repo/branch/SHA/PR/run observation;
- metadata keys/count/serialized size allowlisted and secret-scanned;
- raw provider response/email body/commit instructions never persisted;
- acceptance revalidates target versions/source freshness/policy and creates canonical effects atomically;
- changed candidate invalidates old approval;
- rejection/supersede preserves candidate/claim history.

- [ ] Write failing schema/provenance/dedup/source/staleness/policy/prompt-injection tests.
- [ ] Implement proposal and bounded previews.
- [ ] Implement acceptance/rejection/supersede via approvals/gateway.
- [ ] Migrate review UI and commit after focused gates.

### Task 6: Implement credential lifecycle commands

**Files:**
- Create: `packages/application/src/growth/credential-commands.ts`
- Create: tests.
- Modify credential/storage services/UI.

Risk:

```text
create pending/update metadata → medium
verify/revoke/reject → high
attachment reference/rotation → high according to privacy/storage effect
```

Rules:

- HTTPS verification URL only;
- issuer/title/date/credential ID deduplication;
- email/external proposal creates pending review, never verified;
- verification requires deterministic configured result or owner approval;
- expiry derived at read time;
- attachment uses private storage ref/SHA/type/size, not MCP bytes;
- no raw credential ID/file in public output;
- revoke/reject preserves history.

- [ ] Write failing dedup/URL/status/verification/attachment/privacy tests.
- [ ] Implement commands/previews through canonical services.
- [ ] Migrate owner UI and commit.

### Task 7: Compose Growth registry, atomic effects and manifests

**Files:**
- Create: `packages/database/src/composition/growth-command-registry.ts`
- Create: integration tests.
- Create/modify Growth previews/manifests/coverage.

- [ ] Register the reconciled commands with transaction-bound services/repositories.
- [ ] Prove goal/checkpoint/evidence/credential mutation, Growth event, global audit and command receipt/change-set commit atomically.
- [ ] Prove accepted evidence updates derived projections only through canonical accepted state, never a stored percentage.
- [ ] Prove high commands require current approval and stale candidate/goal/checkpoint versions fail.
- [ ] Validate editability manifests and run confidentiality tests.
- [ ] Commit.

### Task 8: Expose specific filtered Growth MCP write tools

**Files:**
- Create: `packages/mcp/src/growth-write-tools.ts`
- Create: tests.
- Modify MCP catalog/composition after gates.

Representative tools:

```text
devos_create_learning_goal
devos_update_learning_goal
devos_activate_learning_goal
devos_complete_learning_goal
devos_add_learning_checkpoint
devos_update_learning_checkpoint
devos_reorder_learning_checkpoints
devos_record_learning_checkpoint_value
devos_request_checkpoint_waiver
devos_link_goal_repository
devos_propose_learning_evidence
devos_accept_learning_evidence
devos_reject_learning_evidence
devos_create_credential
devos_update_credential
devos_verify_credential
devos_revoke_credential
```

- [ ] Write tests for scopes/capabilities/goal/resource filters, strict schema, provenance, confirmation/approval, idempotency, stale versions, switches and bounded output.
- [ ] Assert discovery contains no percentage setter, direct skill-stage setter, raw attachment upload or generic evidence acceptance bypass.
- [ ] Implement only after remote write gates pass.
- [ ] Run MCP protocol/boundary tests and commit.

### Task 9: Verify Growth UI/MCP parity, derivation and privacy E2E

**Files:**
- Create: `tests/e2e/growth-domain-write-parity.spec.ts`
- Modify test matrix, coverage, Growth/MCP/security/runbook/changelog docs.

Scenarios:

1. quick-create goal manually/template through UI and authorized MCP;
2. checkpoint automatic weights total 100 and custom rebalance requires confirmation;
3. no channel accepts direct percentage;
4. accepted numeric/binary evidence changes derived progress consistently;
5. stale/modified evidence approval fails;
6. required waiver and goal completion require approval;
7. skill achieved stage cannot be manually overwritten;
8. GitHub/email text remains untrusted proposal data;
9. credential proposal stays pending until verified;
10. revoke/pause writes while reads continue;
11. public pages/assets contain no Growth/evidence/credential/client data;
12. 360 px owner review/advanced flows work.

Run focused/full Growth, command, MCP, web/build/Playwright/editability/confidentiality gates; record exact head/results. Update docs by reference and commit.

## Acceptance criteria

- every implemented Growth mutation is canonical-command covered or explicitly unsupported;
- owner UI remains complete without AI;
- authorized MCP tools are specific and resource scoped;
- no direct percentage or achieved-skill setter exists;
- evidence/credential external content remains proposals until deterministic policy or approval;
- acceptance/waiver/verification/completion is state-bound, audited and stale-safe;
- derived progress is consistent across UI/MCP;
- private attachments/credential/Growth state never leak publicly;
- write disable/revocation preserves reads;
- E2E, editability, MCP boundary and confidentiality gates pass.
