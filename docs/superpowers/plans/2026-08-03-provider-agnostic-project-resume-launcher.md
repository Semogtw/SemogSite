# Provider-Agnostic Project Resume Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the authenticated owner classify repository activity conservatively, preview/copy a deterministic continuation prompt, audit the handoff, and open any configured AI destination without provider credentials or UI automation.

**Architecture:** Add a pure `packages/domain/src/resume` boundary, additive SQLite migration `0014`, and owner-only TanStack Start composition. Reuse existing projects, repositories, cooperative runs/checkpoints, manual session handoffs, attention/evidence and immutable GitHub observations. The baseline uses explicit clipboard and generic HTTPS launch actions; webhooks and provider deep links are separate plans.

**Tech Stack:** TypeScript, Vitest, Drizzle metadata, raw SQLite migrations, better-sqlite3, TanStack Start/Router, React, Zod and Playwright.

## Global Constraints

- ChatGPT Sites/Plus, paid APIs, remote MCP and any single AI provider are optional.
- Commit silence may yield `probably_ended`, never `completed`.
- Signal precedence: explicit terminal state, heartbeat/checkpoint, accepted-branch commit/workflow, owner handoff, synchronization freshness.
- Defaults: warning 30 minutes, probably ended 60, stale observation 180; policy must preserve `probablyEnded > warning`.
- Only persisted `active_branch` is canonical; default branch is a warned fallback and recommendations never mutate it.
- GitHub stays read-only; commit messages never enter prompts.
- State is owner-private; public DTOs/HTML expose none of it.
- Launch URLs require HTTPS except loopback and reject credentials/unsafe schemes.
- Clipboard and open are separate explicit actions; no login/DOM/Send automation.
- Writes use owner auth, CSRF, confirmation, idempotency, optimistic versions and audit.
- Persist prompt hash/template/source versions, never the full prompt body.

---

### Task 1: Conservative activity classifier

**Files:**
- Create: `packages/domain/src/resume/development-activity.ts`
- Create: `packages/domain/src/resume/development-activity.test.ts`
- Create: `packages/domain/src/resume/index.ts`
- Modify: `packages/domain/src/index.ts`

**Produces:**

```ts
export type DevelopmentActivityStatus =
  | "reported_active" | "quiet" | "probably_ended" | "stale_unknown"
  | "waiting_user" | "blocked" | "completed" | "failed";
export type ProjectResumePolicy = {
  warningAfterMinutes: number;
  probablyEndedAfterMinutes: number;
  observationStaleAfterMinutes: number;
};
export function classifyDevelopmentActivity(input: DevelopmentActivityInput): DevelopmentActivity;
```

- [x] Write failing tests for signal precedence, 30/60 boundaries, stale observations, blocked/waiting-user, explicit completed/failed, workflow/handoff fallback and invalid timestamps/policy.

```ts
expect(classifyDevelopmentActivity(fixture({
  run: runningRun("2026-08-03T12:55:00.000Z"),
  branchObservation: branchCommit("2026-08-03T10:00:00.000Z"),
  observedAt: "2026-08-03T13:00:00.000Z",
}))).toMatchObject({ status: "reported_active", source: "heartbeat" });
```

- [x] Run RED: `pnpm --filter @semogtw/domain exec vitest run src/resume/development-activity.test.ts`.
- [x] Implement pure timestamp normalization, policy validation, strongest-signal selection, confidence/source/warnings and age derivation.
- [x] Run GREEN plus `pnpm --filter @semogtw/domain typecheck`.
- [x] Commit: `feat(resume): classify development activity conservatively` and push.

**Observed evidence:** focused RED failed on the missing module; focused GREEN passed 7/7, domain typecheck passed, and the complete domain suite passed 44 files / 249 tests.

### Task 2: Policy, target and template contracts

**Files:**
- Create: `packages/domain/src/resume/resume-configuration-service.ts`
- Create: `packages/domain/src/resume/resume-configuration-service.test.ts`
- Modify: `packages/domain/src/resume/index.ts`

**Produces:**

```ts
export type ResumeProviderKind =
  | "chatgpt" | "gemini" | "claude" | "custom_web"
  | "local_agent" | "generic";
export type AiResumeTarget = {
  id: string; projectId: string | null; label: string;
  providerKind: ResumeProviderKind; launchUrl: string;
  deepLinkTemplate: null; enabled: boolean; isDefault: boolean; version: number;
};
```

- [ ] Write failing service tests for threshold order, HTTPS/loopback URLs, credential/unsafe-scheme rejection, one default target per scope, baseline deep-link rejection, template size/allowlisted placeholders, retry identity and stale versions.
- [ ] Run RED: `pnpm --filter @semogtw/domain exec vitest run src/resume/resume-configuration-service.test.ts`.
- [ ] Implement stable validation codes and allow only: `project_name`, `project_slug`, `repository_full_name`, `branch`, `head_sha`, `commit_time`, `activity_age`, `activity_status`, `stage`, `current_position`, `next_step`, `blocker`, `test_evidence`, `previous_handoff`, `generated_at`, `activity_source`, `confidence`.
- [ ] Run GREEN and domain typecheck.
- [ ] Commit: `feat(resume): define policies targets and templates` and push.

### Task 3: SQLite persistence

**Files:**
- Create: `packages/database/migrations/0014_project_resume_launcher.sql`
- Create: `packages/database/src/schema/resume.ts`
- Create: `packages/database/src/resume-migrations.test.ts`
- Create: `packages/database/src/repositories/resume-configuration-repository.ts`
- Create: `packages/database/src/repositories/resume-configuration-repository.test.ts`
- Create: `packages/database/src/repositories/resume-handoff-repository.ts`
- Create: `packages/database/src/repositories/resume-handoff-repository.test.ts`
- Modify: `packages/database/src/schema/index.ts`
- Modify: `packages/database/src/index.ts`
- Modify: `packages/database/src/adapters/sqlite-migrations.test.ts`
- Modify: `packages/database/src/backup/sqlite-backup.test.ts`

**Tables:** `project_resume_policies`, `ai_resume_targets`, `resume_prompt_templates`, `resume_handoffs`.

- [ ] Write failing migration/repository tests for repeatable migration, global/project/repository policy precedence, one default target, optimistic versions, immutable handoffs, 64-char hash, no prompt-body column, transaction rollback and backup/restore.

```ts
await expect(repository.getEffectivePolicy("project-1", "repo-1"))
  .resolves.toMatchObject({ warningAfterMinutes: 10, probablyEndedAfterMinutes: 40 });
```

- [ ] Run RED with the three new DB test files.
- [ ] Implement migration constraints/partial indexes and Drizzle metadata; do not add provider token/webhook columns.
- [ ] Implement immediate transactions that write entity + sanitized `audit_events`; handoffs are insert-only.
- [ ] Run new tests, migration test, backup test and database typecheck.
- [ ] Commit: `feat(resume): persist launcher configuration and handoffs` and push.

### Task 4: Compose trustworthy resume source

**Files:**
- Create: `packages/database/src/repositories/project-resume-source.ts`
- Create: `packages/database/src/repositories/project-resume-source.test.ts`
- Modify: `packages/database/src/index.ts`

**Produces:**

```ts
export class SqliteProjectResumeSource {
  getRepositorySnapshot(input: {
    projectSlug: string; repositoryId: string; observedAt: string;
  }): Promise<ProjectResumeSourceSnapshot | null>;
}
```

The snapshot contains project/repository, accepted branch and fallback warning, latest matching branch observation, cooperative run, workflow timestamp, manual handoff, current stage, evidence, owner-action flag, effective policy/targets/template and deterministic `sourceVersion`.

- [ ] Write failing tests for accepted branch, default fallback, recommendation separation, exact branch observation, heartbeat data, latest handoff/stage/evidence, policy precedence, disabled targets, deterministic source version and missing/ambiguous relations.
- [ ] Run RED: `pnpm --filter @semogtw/database exec vitest run src/repositories/project-resume-source.test.ts`.
- [ ] Implement bounded explicit SQL reads; never read commit messages. Build `sourceVersion` from IDs/versions/timestamps and exact observation ID.
- [ ] Run GREEN and DB typecheck.
- [ ] Commit: `feat(resume): compose project continuation source` and push.

### Task 5: Deterministic prompt and generic adapter

**Files:**
- Create: `packages/domain/src/resume/resume-prompt-renderer.ts`
- Create: `packages/domain/src/resume/resume-prompt-renderer.test.ts`
- Create: `packages/domain/src/resume/resume-target-adapter.ts`
- Create: `packages/domain/src/resume/resume-target-adapter.test.ts`
- Modify: `packages/domain/src/resume/index.ts`

**Produces:**

```ts
export function renderResumePrompt(input: RenderResumePromptInput): {
  prompt: string; templateVersion: number; warnings: readonly string[];
};
export interface ResumeTargetAdapter {
  buildLaunch(input: { target: AiResumeTarget; prompt: string }): Promise<{
    url: string; promptDelivery: "clipboard";
  }>;
}
```

- [ ] Write failing tests for deterministic exact output, branch/SHA/time, conservative inference copy, required sections, missing-data warnings, unknown placeholders, secret-shaped content, 12,000-char bound and clipboard-only URL.
- [ ] Run RED for the two test files.
- [ ] Implement a pure allowlisted renderer and generic target adapter; unknown placeholders fail closed.
- [ ] Run `pnpm --filter @semogtw/domain exec vitest run src/resume` and typecheck.
- [ ] Commit: `feat(resume): render deterministic continuation prompts` and push.

### Task 6: Preview and audited handoff service

**Files:**
- Create: `packages/domain/src/resume/project-resume-service.ts`
- Create: `packages/domain/src/resume/project-resume-service.test.ts`
- Modify: `packages/domain/src/resume/index.ts`

**Produces:**

```ts
export class ProjectResumeService {
  preview(source: ProjectResumeSourceSnapshot, observedAt: string): ProjectResumePreview;
  recordHandoff(input: {
    source: ProjectResumeSourceSnapshot;
    expectedSourceVersion: string;
    targetId: string | null;
    opened: boolean;
    confirmed: true;
  }, context: ResumeHandoffContext): Promise<ResumeHandoffResult>;
}
```

- [ ] Write failing tests for status/action copy, timestamps, deterministic SHA-256 hash, stable retry, changed retry, stale source token, disabled/missing target, copy-only/opened handoff, rollback and no prompt persistence.
- [ ] Run RED: domain resume service test.
- [ ] Implement with injected SHA-256 hasher; re-render current source and reject mismatched `expectedSourceVersion`.
- [ ] Run all resume tests and domain typecheck.
- [ ] Commit: `feat(resume): preview and audit continuation handoffs` and push.

### Task 7: Owner-only server and UI

**Files:**
- Create: `apps/web/src/server/devos-project-resume.ts`
- Create: `apps/web/src/server/devos-project-resume.test.ts`
- Create: `apps/web/src/components/devos/project-resume-card.tsx`
- Create: `apps/web/src/components/devos/project-resume-policy-form.tsx`
- Create: `apps/web/src/components/devos/resume-target-form.tsx`
- Create: `apps/web/src/components/devos/resume-prompt-launcher.tsx`
- Create: `apps/web/src/routes/devos.projects.$slug.resume.$repositoryId.tsx`
- Create: `apps/web/src/routes/-project-resume-controls.test.ts`
- Modify: `apps/web/src/routes/devos.projects.$slug.tsx`
- Modify: `apps/web/src/server/devos-projects.ts`
- Modify: `apps/web/src/styles/devos.css`

**Server functions:** GET preview; POST save policy; POST save target; POST record handoff. Mutations accept CSRF, UUID idempotency and expected version/source token.

- [ ] Write failing structural/server tests for `requireOwner`, `requireMutationOwner`, `noindex`, separate copy/open controls, visible textarea fallback, `noopener,noreferrer`, no prompt URL/cookie/token fields and route-tree idempotence.
- [ ] Run RED with the two web test files.
- [ ] Implement Zod-bounded server composition; preview never writes and handoff writes only after explicit copy/open confirmation.
- [ ] Implement project status card and dedicated mobile route with branch/SHA/absolute time/age/source/confidence, warnings, target config and selectable prompt.

```ts
try {
  await navigator.clipboard.writeText(prompt);
  await recordResumeHandoffFn({ data: { ...identity, opened: false, confirmed: true } });
} catch {
  setClipboardFallback(prompt); // visible textarea; no hidden write/retry
}
```

- [ ] Generate routes twice, require equal `routeTree.gen.ts` hashes, run web tests/typecheck.
- [ ] Commit: `feat(resume): add owner continuation launcher` and push.

### Task 8: Browser/privacy gates and documentation

**Files:**
- Create: `tests/e2e/project-resume-launcher.spec.ts`
- Modify: `scripts/check-public-confidentiality.mjs`
- Modify as required: `playwright.config.ts`
- Modify: `ARCHITECTURE.md`, `DATA_MODEL.md`, `SECURITY.md`, `RUNBOOK.md`, `README.md`, `docs/TESTING.md`
- Modify: `docs/superpowers/plans/README.md`
- Modify: `docs/superpowers/plans/2026-08-01-semogtw-chatgpt-execution-control-plane.md`

- [ ] Write Playwright RED scenarios: 61-minute silence -> **Sessão provavelmente encerrada**; recent heartbeat prevents it; stale observation -> unknown; exact prompt preview; generic target; audited copy/open; clipboard-denied fallback without hidden handoff; copy-only missing target; anonymous isolation; public confidentiality; keyboard and 360×800.
- [ ] Run RED: `node scripts/prepare-e2e.mjs && pnpm exec playwright test tests/e2e/project-resume-launcher.spec.ts`.
- [ ] Complete isolated E2E fixtures/scanner markers; never add production seed prompts/targets.
- [ ] Reconcile docs with source precedence, migration `0014`, no prompt-body storage, outbound disclosure, target/stale/clipboard/popup runbook and provider-neutral terminology. Keep webhooks/deep links deferred.
- [ ] Run complete gate:

```bash
pnpm check:boundaries
pnpm check:public-confidentiality
pnpm --filter @semogtw/domain exec vitest run src/resume
pnpm --filter @semogtw/database exec vitest run \
  src/resume-migrations.test.ts \
  src/repositories/resume-configuration-repository.test.ts \
  src/repositories/resume-handoff-repository.test.ts \
  src/repositories/project-resume-source.test.ts \
  src/adapters/sqlite-migrations.test.ts src/backup/sqlite-backup.test.ts
pnpm --filter @semogtw/web exec vitest run \
  src/server/devos-project-resume.test.ts \
  src/routes/-project-resume-controls.test.ts
pnpm -r typecheck
pnpm check
pnpm build
node scripts/prepare-e2e.mjs
pnpm exec playwright test tests/e2e/project-resume-launcher.spec.ts
```

If the aggregate command exceeds an external limit after guardrails/typechecks, run every package suite serially and record exact totals; never label an unexecuted gate passed.

- [ ] Commit: `test(resume): verify portable continuation launcher` and push.

## Deferred follow-up plans

1. authenticated GitHub webhook/scheduled observation refresh;
2. verified provider deep links or local extension/userscript delivery.

Neither may block clipboard + generic HTTPS launch, store provider cookies or automate Send.
