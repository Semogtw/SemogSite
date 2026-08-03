# Semogtw Isolated Development Executor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Track progress with the checkboxes below.

**Goal:** Execute approved Development Requests in an isolated worker that can edit only the approved repository/branch/path scope, produce frequent validated commits, run allowlisted gates and open a pull request without exposing raw shell or Git credentials to ordinary UI/MCP clients.

**Architecture:** Add a pull-based `apps/development-executor` worker and private executor API. The control plane signs immutable Ed25519 job envelopes. A separately authenticated worker claims one job, creates an isolated repository workspace, runs a statically registered agent adapter inside a host-enforced sandbox, validates every changed path/commit and pushes through a credential broker. GitHub writes are restricted to explicit branch/PR operations. Merge and deployment remain outside this plan.

**Tech Stack:** Node.js 22, TypeScript strict mode, Zod, Vitest, SQLite/Drizzle, Ed25519 at host boundaries, native Git CLI with fixed argv, existing GitHub/read-workflow packages, private HTTP API, Playwright and rootless container/bubblewrap acceptance tests.

## Constraints

- Start only after Development Requests and the command/authorization/approval prerequisites pass.
- Reconcile migration numbering; this plan reserves `0021_development_executor.sql`.
- Explicit owner approval is required before any real repository/executor is enabled.
- Ordinary UI/MCP clients never receive raw shell, arbitrary command, filesystem, Git credential or generic GitHub tools.
- A plain Node child process is not a security sandbox. Executor enablement fails closed without observed host-enforced filesystem/process/network/resource isolation.
- Jobs bind owner, executor, request, repository target, exact base SHA, work branch, path scopes, policy profile, adapter and expiry.
- Ed25519 private signing keys remain server-only; executors receive reviewed public verification keys.
- Executor bearer tokens and attempt tokens are digest-only server-side and returned once.
- Agent executable/argv comes from a static operator registry, never UI/MCP/job input.
- Agent processes receive neither Git push nor deployment credentials.
- Git hooks, submodules, credential helpers and repository-local executable configuration are disabled unless separately reviewed.
- Every changed path is checked before checkpoint, commit and push.
- Checkpoint cadence is at most 30 active minutes with changes or after each independently reviewable task.
- Gate policy is versioned and captured before the job; worktree edits cannot alter the active policy.
- Gate evidence is exact-SHA and uses existing verification-obligation semantics.
- Network/dependency access is denied by default and enabled only by a reviewed profile.
- Protected/default branches are never directly pushed; final output is an exact-head draft PR.
- Logs/artifacts are bounded/sanitized; no raw secrets, environment, prompts, repository bodies or unrestricted diffs in normal logs.
- Public output contains no executor/job/repository/branch/path/log/artifact state.
- Commit and push after each independently reviewable task.

## Planned files

```text
packages/application/src/development-execution/
packages/database/migrations/0021_development_executor.sql
packages/database/src/schema/development-executor.ts
packages/database/src/repositories/executor-*.ts
packages/database/src/composition/development-executor-dispatch.ts
packages/github/src/write/pull-request-client.ts
packages/development-executor/
apps/development-executor/
apps/api/src/routes/private/executor-*.ts
apps/web/src/server/devos-executors.ts
apps/web/src/routes/devos.development.executors*.tsx
apps/web/src/components/devos/executor-*.tsx
executor/policies/semogsite-v1.json
scripts/check-development-executor-boundaries.mjs
scripts/verify-executor-sandbox.mjs
tests/e2e/development-executor-control.spec.ts
docs/testing/2026-08-03-development-executor-test-matrix.md
docs/testing/2026-08-03-development-executor-isolation-profile.json
docs/testing/2026-08-03-development-agent-adapter-profile.json
```

---

### Task 1: Resolve concrete isolation and agent-adapter profiles

**Files:** Create the test matrix and two machine-readable profile evidence files; update architecture/stack docs.

- [ ] Inspect prerequisites, exact head and migration reservation.

```bash
git fetch --all --prune
git status --short --branch
git rev-parse HEAD
ls packages/database/migrations | sort
rg -n "DevelopmentRequest|approved_for_development|ScopeReservation|VerificationObligation|0021_" packages apps docs
```

- [ ] Probe host tooling.

```bash
node --version
git --version
command -v podman || true
command -v docker || true
command -v bwrap || true
command -v systemd-run || true
```

- [ ] Create `docs/testing/2026-08-03-development-executor-isolation-profile.json` with this exact schema:

```json
{
  "schemaVersion": 1,
  "profile": "executor_disabled",
  "runtimePath": null,
  "runtimeVersion": null,
  "observedAt": "2026-08-03T00:00:00.000Z",
  "evidenceStatus": "blocked",
  "reasonCode": "NO_REVIEWED_HOST_ISOLATION"
}
```

Replace values only with observed evidence. Allowed `profile` values are `rootless_podman`, `rootless_docker`, `linux_bubblewrap`, `executor_disabled`. If any required boundary is unproven, keep `executor_disabled`.

- [ ] Create `docs/testing/2026-08-03-development-agent-adapter-profile.json`:

```json
{
  "schemaVersion": 1,
  "adapterId": "deterministic_test_agent",
  "realExecutionEnabled": false,
  "executablePath": null,
  "executableVersion": null,
  "observedAt": "2026-08-03T00:00:00.000Z",
  "reasonCode": "REAL_AGENT_NOT_YET_REVIEWED"
}
```

A real adapter may replace these values only after the executable/version/argv/input/secret/network behavior is observed and approved. Unit/mandatory acceptance always retains the deterministic test adapter.

- [ ] Record the required sandbox evidence: isolated workspace, read-only policies/toolchain, no home/SSH/runtime socket, non-root user, process/CPU/memory/disk/wall limits, network disabled by default, bounded allowlisted egress, secret mounts only for brokered subprocess, cleanup, and no privileged/host PID/network/socket.
- [ ] Run prerequisite tests and record exact results.

```bash
pnpm check:run-ledger-guardrails
pnpm check:editability-coverage
pnpm --filter @semogtw/application test
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/github test
```

- [ ] Commit both evidence files even when disabled; they prevent later agents from assuming capability.

### Task 2: Define signed immutable job envelopes

**Files:** Create application types, canonical validation/signing ports and tests.

```ts
export type DevelopmentExecutorJobPayload = {
  schemaVersion: 1;
  jobId: string;
  ownerId: string;
  executorId: string;
  requestId: string;
  requestVersion: number;
  repositoryTargetId: string;
  repositoryFullName: string;
  remoteUrlRef: string;
  baseBranch: string;
  baseSha: string;
  workBranch: string;
  pathScopes: readonly DevelopmentPathScope[];
  impactFlags: readonly DevelopmentImpactFlag[];
  policyProfileId: string;
  policyProfileVersion: number;
  policySha256: string;
  agentAdapterId: string;
  requiredGateIds: readonly string[];
  secretRefs: readonly string[];
  networkPolicy:
    | { kind: "disabled" }
    | { kind: "allowlist"; profileId: string; profileVersion: number };
  resourceLimits: {
    wallTimeSeconds: number;
    cpuShares: number;
    memoryMiB: number;
    diskMiB: number;
    processLimit: number;
  };
  issuedAt: string;
  expiresAt: string;
  nonce: string;
};

export type SignedDevelopmentExecutorJob = {
  keyId: string;
  algorithm: "Ed25519";
  payload: DevelopmentExecutorJobPayload;
  signatureBase64Url: string;
};
```

- [ ] Write failing tests for valid signatures and mutation/wrong-key/algorithm/expiry/path/policy/adapter/resource-limit rejection.
- [ ] Enforce 15-minute pre-claim TTL, max 20 secret refs, max 50 gates, max 200 path scopes and at least 128 nonce bits.
- [ ] Keep Node crypto implementation outside the framework-free application package.
- [ ] Run application tests/typecheck and commit.

### Task 3: Define static executor policy profiles

**Files:** Create application policy types/tests and `executor/policies/semogsite-v1.json` with tests.

```ts
export type ExecutorGateDefinition = {
  id: string;
  label: string;
  argv: readonly string[];
  cwd: string;
  timeoutSeconds: number;
  requiredImpactFlags: readonly DevelopmentImpactFlag[];
  networkPolicy: "disabled" | "package_registry_read";
  outputLimitBytes: number;
};
```

`semogsite-v1` uses fixed argv for frozen install, package tests, typecheck, boundaries, confidentiality, full check and build. No caller-supplied extra args.

- [ ] Write failing tests rejecting shell strings, `sh/bash -c`, unsafe cwd, duplicate gates, unknown network profiles and excessive resources/output/timeouts.
- [ ] Hash/copy the approved policy before signing; never load active policy from the work branch.
- [ ] Run tests and commit.

### Task 4: Add migration 0021 and executor persistence

**Tables:**

```text
development_executors
development_executor_credentials
development_executor_signing_keys
development_executor_jobs
development_executor_attempts
development_executor_heartbeats
development_executor_checkpoints
development_executor_gate_runs
development_executor_artifacts
development_executor_pull_requests
development_executor_events
development_executor_switches
```

- [ ] Write failing migration tests for statuses, digest-only credentials/attempt tokens, public-key-only signing metadata, one active lease/job, monotonic heartbeat/checkpoint sequences, artifact refs without bodies and default-disabled switch.
- [ ] Confirm no raw environment, Git secret, prompt, diff or arbitrary command column.
- [ ] Implement migration/schema and backup/restore tests.
- [ ] Run database tests/typecheck and commit.

### Task 5: Implement executor registration, credential rotation and kill switch

**Files:** Create registration/switch repositories/tests, owner server commands and manifests.

```ts
export interface ExecutorRegistrationRepository {
  create(input: CreateExecutorRecord): {
    executor: ExecutorRecord;
    rawToken: string;
  };
  findActiveByTokenDigest(digest: string): ExecutorRecord | null;
  rotateCredential(input: RotateExecutorCredentialRecord): string | null;
  pause(input: ExecutorStatusChange): boolean;
  revoke(input: ExecutorStatusChange): boolean;
}
```

- [ ] Test one-time 32-byte-or-greater token, digest-only storage, approved targets/policies/profiles, rotation, pause/revoke lease invalidation and no self-management.
- [ ] Global executor enable is critical and requires recent owner authentication; pause/revoke is immediate.
- [ ] Implement through canonical commands/approvals and commit.

### Task 6: Implement atomic dispatch, lease and signed job creation

**Files:** Create lease logic/tests, job/attempt repositories and dispatch composition/tests.

```ts
export interface DevelopmentExecutorDispatch {
  queue(input: QueueDevelopmentExecutorJobInput): Promise<{ jobId: string }>;
  claim(input: {
    executorId: string;
    now: string;
  }): Promise<{
    job: SignedDevelopmentExecutorJob;
    attemptId: string;
    attemptToken: string;
    leaseExpiresAt: string;
  } | null>;
  heartbeat(input: ExecutorHeartbeatInput): Promise<boolean>;
}
```

Lease policy: 5-minute initial lease, 30-second heartbeat, 2-minute extension, at most 30 minutes without checkpoint/progress.

- [ ] Test exclusive claim, monotonic heartbeat, lease loss, pause/revoke, stale request/approval, duplicate queue/idempotency and expired-signature regeneration with unchanged canonical payload.
- [ ] Load private signing key from server secret by key ID; never persist/log it.
- [ ] Run tests and commit.

### Task 7: Build the private executor API

**Endpoints:**

```text
POST /api/v1/executor/jobs/claim
POST /api/v1/executor/jobs/:attemptId/heartbeat
POST /api/v1/executor/jobs/:attemptId/checkpoints
POST /api/v1/executor/jobs/:attemptId/gates
POST /api/v1/executor/jobs/:attemptId/artifacts
POST /api/v1/executor/jobs/:attemptId/complete
POST /api/v1/executor/jobs/:attemptId/fail
```

- [ ] Authenticate executor bearer token by digest before private job projection.
- [ ] Require separate digest-bound attempt token after claim.
- [ ] Enforce TLS/canonical host/proxy in production, 64 KiB metadata bodies, private/no-store, per-executor limits and stable sanitized errors.
- [ ] Reject raw logs/diffs/environment and results claiming unrecorded commits/gates.
- [ ] Write route/security/replay/size/concurrency tests, implement and commit.

### Task 8: Create fail-closed executor package/config/client/verifier

**Files:** Create `@semogtw/development-executor` package and tests.

```ts
export type DevelopmentExecutorConfig = {
  executorId: string;
  controlPlaneUrl: string;
  executorToken: string;
  trustedSigningKeys: Readonly<Record<string, string>>;
  workspaceRoot: string;
  cacheRoot: string;
  isolationProfileFile: string;
  agentAdapterProfileFile: string;
  pollIntervalSeconds: number;
};
```

- [ ] Require HTTPS except loopback tests; reject URL credentials/query/hash.
- [ ] Require absolute distinct non-root/non-home non-symlink workspace/cache paths.
- [ ] Load and validate the exact Task-1 evidence files; `executor_disabled` or `realExecutionEnabled:false` prevents real-agent claim while deterministic test mode remains possible in test harnesses.
- [ ] Never print token/job body/error response body.
- [ ] Test unsafe config, missing runtime/profile, wrong/expired job and signal shutdown.
- [ ] Implement, update lockfile/workspace tests and commit.

### Task 9: Implement isolated workspace, path policy and fixed Git operations

**Git environment:**

```text
GIT_CONFIG_NOSYSTEM=1
HOME=<empty executor temp dir>
core.hooksPath=/dev/null
credential.helper disabled except executor-owned askpass during brokered operations
protocol.file.allow=never
submodule.recurse=false
fetch.fsckObjects=true
receive.fsckObjects=true
safe.directory=<exact workspace>
```

- [ ] Write path tests for traversal, symlink escape, rename/deletion/untracked files, `.git`, case collision and valid nested scopes.
- [ ] Write temporary-local-repository tests for exact base, protected branch no-push, fixed argv, hooks/submodules disabled, credential redaction and cleanup.
- [ ] Implement child processes with `execFile`/argv, timeout, output bound and sanitized environment; never shell.
- [ ] Commit.

### Task 10: Implement static agent adapters and sandbox verification

**Files:** Create agent registry/runner tests and `scripts/verify-executor-sandbox.mjs`.

```ts
export type AgentAdapterDefinition = {
  id: string;
  executable: string;
  argvTemplate: readonly string[];
  inputMode: "stdin_json" | "context_file";
  maximumOutputBytes: number;
};
```

- [ ] Registry is operator-compiled; unknown or caller-supplied executable/args are rejected.
- [ ] Control context is an executor-owned read-only file outside editable workspace; repository content is untrusted data.
- [ ] Model/provider secrets use host-mounted secret refs and never enter context/logs/Git credentials.
- [ ] Write tests for unknown adapters, context separation, cancellation, output overflow and safe sandbox command construction.
- [ ] Implement `verify-executor-sandbox.mjs --profile-file <file>` and test attempted host-home read, outside write, runtime socket, process/memory abuse, disabled-network access and unmounted-secret read all fail while workspace write succeeds.
- [ ] Execute the concrete command without symbolic profile values:

```bash
node scripts/verify-executor-sandbox.mjs --profile-file docs/testing/2026-08-03-development-executor-isolation-profile.json
```

When the evidence file says `executor_disabled`, the script must return a stable blocked result and real execution remains disabled; it must not silently select a weaker profile.

- [ ] Implement only the deterministic test adapter plus any real adapter explicitly named/enabled by the Task-1 profile; no generic custom-command adapter.
- [ ] Commit.

### Task 11: Implement checkpoint cadence, scoped commits and controlled pushes

```ts
export type ExecutorCheckpoint = {
  sequence: number;
  commitSha: string;
  observedAt: string;
  changedPaths: readonly string[];
  summary: string;
  requestCheckpointIds: readonly string[];
};
```

- [ ] No changes means no synthetic commit.
- [ ] Validate paths before commit; dedicated executor author with bounded message/trailers.
- [ ] Push only the approved work branch/current expected head using a short-lived executor-owned askpass credential unavailable to the agent.
- [ ] Record checkpoint only after remote head observation confirms the SHA.
- [ ] Test no-change, valid checkpoint, out-of-scope abort, push failure, remote mismatch, cadence and duplicate idempotency.
- [ ] Implement and commit.

### Task 12: Run allowlisted exact-SHA gates

```ts
export type ExecutorGateResult = {
  gateId: string;
  commandDisplay: string;
  commitSha: string;
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
```

- [ ] Verify clean workspace and exact HEAD before/after each fixed gate.
- [ ] Apply policy argv/cwd/timeout/output/network exactly.
- [ ] Use deterministic exit/host mappings; model text never creates a pass.
- [ ] Store bounded/redacted output; optional full logs use private storage refs/hash/retention.
- [ ] Server accepts results only for signed-job allowed gates and recorded attempt/checkpoint SHA.
- [ ] Test unknown/dirty/changed-head/timeout/output/network/classification/secret cases and commit.

### Task 13: Add constrained GitHub PR write adapter

```ts
export interface GitHubPullRequestWriteClient {
  createPullRequest(input: {
    owner: string;
    repository: string;
    title: string;
    body: string;
    headBranch: string;
    baseBranch: string;
    expectedHeadSha: string;
    draft: boolean;
  }): Promise<GitHubPullRequestRef>;
  getPullRequest(input: {
    owner: string;
    repository: string;
    number: number;
  }): Promise<GitHubPullRequestRef>;
}
```

- [ ] Separate fine-grained exact-repository write token/config from the existing read-only client.
- [ ] Verify remote branch head equals expected SHA before PR create.
- [ ] Bound title/body and exclude raw logs/secrets/prompts.
- [ ] Expose no merge/delete/default-branch/admin/issues/releases methods.
- [ ] Test HTTP requests, idempotent existing PR reconciliation, errors/rate limits and secret sanitization.
- [ ] Implement and commit.

### Task 14: Complete jobs and open exact-head draft PRs

Preconditions: accepted agent result, clean workspace, in-scope changes, pushed remote-confirmed final head, required checkpoints and exact-head gates, current request/approval/executor/switch.

- [ ] Write integration tests for every precondition, idempotent PR, remote mismatch, gate failure, revoke/switch race and provider-success/DB-failure reconciliation.
- [ ] Final sequence: checkpoint/push → gates → revalidation → create/reuse draft PR → store PR ref → mark job success/request ready for review → release/retain reservations according to policy.
- [ ] Record external success as saga/reconciliation state; never create duplicate PR after retry.
- [ ] Commit.

### Task 15: Add worker loop and owner monitoring UI

Worker loop: validate profile/config → poll → verify job → sandbox/workspace → heartbeat → agent/checkpoints/gates → PR/complete or stable failure → cleanup → jittered backoff.

- [ ] Initially allow one active job per process.
- [ ] Handle signals, lease loss and startup cleanup only for marked expired executor-owned directories.
- [ ] Structured logs allow IDs/phase/duration/stable code only.
- [ ] Owner UI shows profile/evidence/status/heartbeat, switches, jobs, checkpoint SHAs, gate classifications, PR and credential rotation/pause/revoke; never raw tokens/keys/prompts/logs/environment.
- [ ] Write worker/web/mobile tests, implement and commit.

### Task 16: Add permanent executor boundary guardrails

Guardrail must reject:

```text
raw child_process/shell outside the fixed executor runner
exec(), shell:true or shell interpreter argv
UI/MCP imports of executor internals
ordinary MCP tools named shell/sql/file/http/deploy
GitHub writes outside packages/github/src/write
executor dependency on web/database/browser auth
credential/token logging markers
privileged/host socket/host network runtime flags
policy gates containing shell interpreters
```

- [ ] Write fixture tests for every forbidden pattern.
- [ ] Implement parsing/structured inspection where semantics matter.
- [ ] Add `check:development-executor-boundaries` to `pnpm check`.
- [ ] Run guardrail tests/full check and commit.

### Task 17: Verify sandbox, checkpoints, gates, PR and emergency shutdown E2E

Mandatory harness uses a disposable local/bare repository, the deterministic test adapter and fake GitHub HTTP server. Live GitHub/paid model acceptance is separate and requires explicit approval.

Scenarios:

1. disabled executor cannot claim;
2. reviewed executor can be recent-auth enabled;
3. approved request queues one signed job;
4. wrong key/executor/expiry/mutation is rejected;
5. sandbox boundary attacks fail;
6. allowed change checkpoints/pushes;
7. out-of-scope/symlink change aborts before push;
8. gates pass/fail/block accurately;
9. exact-head clean job opens one draft PR;
10. duplicate completion reuses PR;
11. pause/revoke/switch/lease loss fails closed;
12. logs/build/artifacts contain no synthetic secrets;
13. public output contains no private execution state;
14. owner UI works at 360 px.

Run:

```bash
node scripts/verify-executor-sandbox.mjs --profile-file docs/testing/2026-08-03-development-executor-isolation-profile.json
pnpm check:development-executor-boundaries
pnpm check:run-ledger-guardrails
pnpm check:editability-coverage
pnpm check:public-confidentiality
pnpm --filter @semogtw/application test
pnpm --filter @semogtw/domain test
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/github test
pnpm --filter @semogtw/development-executor test
pnpm --filter @semogtw/api test
pnpm --filter @semogtw/web test
pnpm --filter @semogtw/web typecheck
pnpm --filter @semogtw/web build
pnpm exec playwright test tests/e2e/development-executor-control.spec.ts
pnpm check
pnpm build
```

- [ ] Rehearse global disable, executor pause/revoke/token rotation, active attempt cancellation, signing-key invalidation, safe cleanup, external PR reconciliation and retention of immutable request/checkpoint/gate history.
- [ ] Update architecture/data/MCP/security/deployment/runbook/changelog by reference and commit.

## Acceptance criteria

- no executor enables without observed host sandbox evidence;
- jobs are immutable, signed, exact-scope and short-lived;
- executor identity/token is independent and revocable;
- ordinary UI/MCP exposes no raw shell/filesystem/Git/provider credential;
- static adapter/policy registries prevent caller-selected executables/argv;
- workspace/Git operations use fixed argv and no shell;
- all changed paths are validated before commit/push;
- checkpoint cadence and exact remote SHAs are observed;
- gates are allowlisted, exact-SHA and accurately classified;
- GitHub adapter is limited to exact-head PR create/read;
- final job creates at most one draft PR and never merges/deploys;
- switches, lease loss, revocation and cleanup fail closed;
- mandatory tests require no paid model/live GitHub;
- sandbox, secret, boundary, confidentiality and full workspace gates pass.
