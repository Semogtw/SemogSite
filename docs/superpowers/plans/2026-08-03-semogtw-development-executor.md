# Semogtw Isolated Development Executor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute approved Development Requests in an isolated worker that can edit only the approved repository/branch/path scope, produce frequent validated commits, run allowlisted gates and open a pull request without exposing raw shell or Git credentials to ordinary UI/MCP clients.

**Architecture:** Add a pull-based `apps/development-executor` worker and a private executor HTTP boundary. The control plane signs immutable Ed25519 job envelopes; a separately authenticated worker claims one job, creates an isolated repository worktree, runs a statically registered agent adapter inside a host-enforced sandbox, validates every changed path/commit and pushes through a credential broker. GitHub write support is limited to explicit branch/PR operations in a separate adapter; merge and deployment remain outside this plan.

**Tech Stack:** Node.js 22, TypeScript strict mode, Zod, Vitest, SQLite/Drizzle, Ed25519 through Node crypto at host boundaries, native Git CLI with fixed argv, existing `@semogtw/github`, Command Gateway/approvals/Development Requests, private HTTP API, Playwright and container-runtime acceptance tests.

## Global Constraints

- Implement only after `2026-08-03-semogtw-development-requests-control-plane.md` and its prerequisite command/authorization/approval plans pass.
- Explicit owner approval is required before enabling an executor against any real repository.
- Reconcile migration numbering; this plan reserves `0021_development_executor.sql`.
- Ordinary UI/MCP clients never receive raw shell, arbitrary command, filesystem, Git credential or generic GitHub API tools.
- The executor may run commands only inside a host-enforced sandbox. Node validation alone is not a security sandbox.
- Executor enablement fails closed unless a reviewed container/isolation runtime proves workspace, process, network, resource and secret boundaries.
- A job is bound to one owner, executor, Development Request, repository target, base SHA, work branch, path scopes, policy profile and expiry.
- Job signatures use Ed25519; private signing key remains server-only, executor receives only reviewed public verification keys.
- Executor authentication uses an independent opaque token stored only as a digest server-side; the raw token is returned once and stored in executor secrets.
- Job IDs, leases and attempt tokens grant no command/resource authorization beyond the signed job.
- Agent adapter executable/argv is selected from an operator-managed static registry, never supplied by UI/MCP/job input.
- The agent process receives no GitHub credential and no deployment credential.
- Git hooks, submodules, credential helpers and repository-local executable configuration are disabled unless separately reviewed.
- Every changed path is checked against approved normalized scopes before checkpoint, commit and push.
- Every pushed checkpoint records exact SHA; “frequent” means at least one checkpoint every 30 minutes of active agent time or after each independently reviewable task, whichever occurs first.
- Gate commands come from a versioned executor policy captured from the approved base SHA/control-plane copy; worktree edits cannot change the active policy.
- Gate evidence is exact-SHA and uses the existing verification-obligation semantics.
- Dependency/network access is denied by default and enabled only by a reviewed policy profile/impact flag.
- Protected/default branches are never pushed directly.
- Pull-request creation is explicit and exact-head bound; merge remains disabled in this plan.
- Logs/artifacts are bounded and sanitized; raw secrets, environment, prompts, repository bodies and unrestricted diffs are not normal logs.
- Public output contains no executor/job/repository/branch/path/log/artifact data.
- Commit and push after each independently reviewable task.

---

## Planned file structure

```text
packages/application/src/development-execution/
  types.ts
  job-envelope.ts
  job-envelope.test.ts
  policy.ts
  policy.test.ts
  lease.ts
  lease.test.ts
  result-validation.ts
  result-validation.test.ts
  index.ts

packages/database/
  migrations/0021_development_executor.sql
  src/schema/development-executor.ts
  src/repositories/executor-registration-repository.ts
  src/repositories/executor-registration-repository.test.ts
  src/repositories/executor-job-repository.ts
  src/repositories/executor-job-repository.test.ts
  src/repositories/executor-attempt-repository.ts
  src/repositories/executor-attempt-repository.test.ts
  src/repositories/executor-artifact-repository.ts
  src/repositories/executor-artifact-repository.test.ts
  src/repositories/executor-switch-repository.ts
  src/repositories/executor-switch-repository.test.ts
  src/composition/development-executor-dispatch.ts
  src/composition/development-executor-dispatch.test.ts

packages/github/src/write/
  pull-request-client.ts
  pull-request-client.test.ts
  index.ts

packages/development-executor/
  package.json
  tsconfig.json
  src/index.ts
  src/config.ts
  src/config.test.ts
  src/client.ts
  src/client.test.ts
  src/job-verifier.ts
  src/job-verifier.test.ts
  src/workspace.ts
  src/workspace.test.ts
  src/git-runner.ts
  src/git-runner.test.ts
  src/path-policy.ts
  src/path-policy.test.ts
  src/agent-adapters.ts
  src/agent-adapters.test.ts
  src/gate-catalog.ts
  src/gate-catalog.test.ts
  src/gate-runner.ts
  src/gate-runner.test.ts
  src/checkpoint-observer.ts
  src/checkpoint-observer.test.ts
  src/executor.ts
  src/executor.test.ts

apps/development-executor/
  package.json
  tsconfig.json
  src/main.ts

apps/api/src/routes/private/
  executor-registration.ts
  executor-jobs.ts
  executor-jobs.test.ts

executor/policies/
  semogsite-v1.json
  semogsite-v1.test.ts

scripts/
  check-development-executor-boundaries.mjs
  check-development-executor-boundaries.test.mjs
  verify-executor-sandbox.mjs

apps/web/src/server/
  devos-executors.ts
  devos-executors.test.ts

apps/web/src/routes/
  devos.development.executors.tsx
  devos.development.executors.index.tsx
  devos.development.executors.$executorId.tsx

apps/web/src/components/devos/
  executor-registration-form.tsx
  executor-status-card.tsx
  executor-job-timeline.tsx
  executor-switch.tsx

tests/e2e/
  development-executor-control.spec.ts

docs/testing/
  2026-08-03-development-executor-test-matrix.md
```

---

### Task 1: Verify host isolation capabilities and reserve migration 0021

**Files:**
- Create: `docs/testing/2026-08-03-development-executor-test-matrix.md`
- Modify: `docs/architecture/DEVELOPMENT_CONTROL_PLANE.md`
- Modify: `docs/superpowers/plans/2026-08-03-semogtw-agent-editability-plan-stack.md`

**Interfaces:**
- Consumes: observed Development Request/approval state, host toolchain and current repository/GitHub adapter boundaries.
- Produces: an enablement decision and exact isolation profile; no executor code is enabled without it.

- [ ] **Step 1: Inspect prerequisites and migrations**

```bash
git fetch --all --prune
git status --short --branch
git rev-parse HEAD
ls packages/database/migrations | sort
rg -n "DevelopmentRequest|approved_for_development|approved_for_merge|ScopeReservation|VerificationObligation" packages apps docs
rg -n "0021_development_executor|0021_" packages/database/migrations docs/superpowers
```

Expected: prerequisites are present and `0021` is free, or all unimplemented reservations are renumbered before code.

- [ ] **Step 2: Probe supported isolation runtimes**

```bash
node --version
git --version
command -v podman || true
command -v docker || true
command -v systemd-run || true
command -v bwrap || true
command -v firejail || true
```

Record exact versions/availability. Select one reviewed profile:

```text
rootless_podman
rootless_docker
linux_bubblewrap
executor_disabled
```

`executor_disabled` is mandatory when none can prove the required filesystem/process/network/resource constraints. A plain Node child process is insufficient.

- [ ] **Step 3: Define the required sandbox evidence**

The selected profile must prove:

```text
read/write mount limited to one attempt workspace
read-only toolchain/policy mounts
no host home/.ssh/git config mount
non-root uid/gid
process count, CPU, memory, disk and wall-time limits
network disabled by default
allowlisted egress profile when explicitly required
secret files/FDs mounted only for the brokered subprocess
cleanup after success/failure/timeout
no privileged mode, host PID/network/socket or Docker socket
```

- [ ] **Step 4: Run prerequisite gates**

```bash
pnpm check:run-ledger-guardrails
pnpm check:editability-coverage
pnpm --filter @semogtw/application test
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/github test
```

Record exact results.

- [ ] **Step 5: Commit**

```bash
git add docs/testing/2026-08-03-development-executor-test-matrix.md \
  docs/architecture/DEVELOPMENT_CONTROL_PLANE.md \
  docs/superpowers/plans/2026-08-03-semogtw-agent-editability-plan-stack.md
git commit -m "docs: establish executor isolation gate"
git push
```

---

### Task 2: Define signed immutable job envelopes

**Files:**
- Create: `packages/application/src/development-execution/types.ts`
- Create: `packages/application/src/development-execution/job-envelope.ts`
- Create: `packages/application/src/development-execution/job-envelope.test.ts`
- Create: `packages/application/src/development-execution/index.ts`
- Modify: `packages/application/src/index.ts`

**Interfaces:**

```ts
export type ExecutorNetworkPolicy =
  | { kind: "disabled" }
  | { kind: "allowlist"; profileId: string; profileVersion: number };

export type ExecutorResourceLimits = {
  wallTimeSeconds: number;
  cpuShares: number;
  memoryMiB: number;
  diskMiB: number;
  processLimit: number;
};

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
  networkPolicy: ExecutorNetworkPolicy;
  resourceLimits: ExecutorResourceLimits;
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

export interface DevelopmentJobSigner {
  sign(payload: DevelopmentExecutorJobPayload): Promise<SignedDevelopmentExecutorJob>;
}

export interface DevelopmentJobVerifier {
  verify(job: SignedDevelopmentExecutorJob): Promise<DevelopmentExecutorJobPayload | null>;
}
```

Bounds:

```text
job TTL: 15 minutes before claim
secret refs: max 20, identifiers only
required gates: max 50
path scopes: max 200
repository full name: exact owner/name
resource limits: configured min/max; job may only choose within profile ceiling
nonce: at least 128 random bits
```

- [ ] **Step 1: Write failing schema/canonical signing tests**

Test signature-valid payload, any-field mutation rejection, wrong key/algorithm, expiry, duplicate/unsafe paths, unknown policy/adapter, out-of-range resources and canonical key ordering.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/application exec vitest run src/development-execution/job-envelope.test.ts
```

- [ ] **Step 3: Implement pure validation and signer/verifier ports**

The application package defines ports/canonical payload only. Node Ed25519 implementation belongs in server/executor host adapters.

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/application exec vitest run src/development-execution/job-envelope.test.ts
pnpm --filter @semogtw/application typecheck
git add packages/application/src
git commit -m "feat: define signed executor jobs"
git push
```

---

### Task 3: Define static executor policy profiles

**Files:**
- Create: `packages/application/src/development-execution/policy.ts`
- Create: `packages/application/src/development-execution/policy.test.ts`
- Create: `executor/policies/semogsite-v1.json`
- Create: `executor/policies/semogsite-v1.test.ts`
- Modify: package/test workspace configuration as needed.

**Interfaces:**

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

export type DevelopmentExecutorPolicy = {
  id: string;
  version: number;
  repositoryFullName: string;
  allowedBaseBranchPrefixes: readonly string[];
  allowedWorkBranchPrefix: string;
  allowedAgentAdapterIds: readonly string[];
  allowedGateIds: readonly string[];
  gates: readonly ExecutorGateDefinition[];
  dependencyChangePolicy: "deny" | "approval_required";
  checkpointIntervalMinutes: 30;
  resourceCeilings: ExecutorResourceLimits;
  allowedNetworkProfileIds: readonly string[];
};

export function validateDevelopmentExecutorPolicy(
  value: unknown,
): DevelopmentExecutorPolicy;
export function sha256DevelopmentExecutorPolicy(
  policy: DevelopmentExecutorPolicy,
): Promise<string>;
```

`semogsite-v1` gates use fixed argv arrays:

```text
install_frozen       → pnpm install --frozen-lockfile
domain_tests         → pnpm --filter @semogtw/domain test
application_tests    → pnpm --filter @semogtw/application test
database_tests       → pnpm --filter @semogtw/database test
web_tests            → pnpm --filter @semogtw/web test
typecheck            → pnpm typecheck
boundaries           → pnpm check:boundaries
public_confidentiality → pnpm check:public-confidentiality
full_check           → pnpm check
build                → pnpm build
```

No gate accepts caller-supplied additional args. `install_frozen` is the only default gate with package-registry egress; dependency lockfile modification requires `dependency_change` impact and separate approved policy profile before a non-frozen install is added.

- [ ] **Step 1: Write failing policy tests**

Reject shell strings, empty argv, `sh -c`, `bash -c`, `cmd /c`, unsafe cwd, duplicate gate IDs, unknown network profile, excessive timeout/output/resources and mismatched repository.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/application exec vitest run src/development-execution/policy.test.ts
pnpm exec vitest run executor/policies/semogsite-v1.test.ts
```

- [ ] **Step 3: Implement validation and frozen policy file**

The active policy is copied/hashed by the control plane before job signing. The executor never loads an edited policy from the work branch.

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/application exec vitest run src/development-execution/policy.test.ts
pnpm exec vitest run executor/policies/semogsite-v1.test.ts
git add packages/application/src executor/policies
git commit -m "feat: add static executor policy profiles"
git push
```

---

### Task 4: Add migration 0021 for executors, jobs, attempts and artifacts

**Files:**
- Create: `packages/database/migrations/0021_development_executor.sql`
- Create: `packages/database/src/schema/development-executor.ts`
- Modify: `packages/database/src/schema/index.ts`
- Modify: `packages/database/src/index.ts`
- Create: migration tests.
- Modify: backup/restore tests.

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

States:

```text
executor: pending | active | paused | revoked
job: queued | leased | running | verification | ready_for_review | succeeded | failed | cancelled | expired
attempt: leased | preparing | running_agent | checkpointing | verifying | pushing | opening_pr | completed | failed | cancelled | lease_lost
artifact: pending | available | rejected | expired
```

Security requirements:

- executor credential/token is digest-only;
- signing private key is not stored in SQLite; table stores key ID/public key/status/validity metadata;
- signed canonical payload and signature may be stored because they contain no secret values;
- attempt token is digest-only;
- one active lease per job;
- one current attempt per lease generation;
- heartbeat sequence monotonic;
- artifact records store metadata/private storage refs/hash/size only, no blob/log body;
- no raw environment, Git credential, secret value, model prompt, arbitrary diff or shell command column;
- executor switch defaults disabled.

- [ ] **Step 1: Write failing migration tests**

Test FKs to Development Requests/OAuth owner records, status/check constraints, digest-only fields, lease uniqueness, monotonic checkpoint sequence, default disabled and no forbidden columns.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/database exec vitest run src/development-executor-migrations.test.ts src/adapters/sqlite-migrations.test.ts
```

- [ ] **Step 3: Implement migration/schema**

Use UTC ISO timestamps and integer versions/lease generations.

- [ ] **Step 4: Extend backup/restore tests**

Preserve registrations/jobs/checkpoints/gates/PR refs without raw credentials/artifacts.

- [ ] **Step 5: Run and commit**

```bash
pnpm --filter @semogtw/database exec vitest run \
  src/development-executor-migrations.test.ts \
  src/adapters/sqlite-migrations.test.ts \
  src/backup/sqlite-backup.test.ts
pnpm --filter @semogtw/database typecheck
git add packages/database
git commit -m "feat: add development executor persistence"
git push
```

---

### Task 5: Implement executor registration, credentials and kill switch

**Files:**
- Create repository/test files listed in planned structure for registration/switches.
- Create: `apps/web/src/server/devos-executors.ts`
- Create: `apps/web/src/server/devos-executors.test.ts`
- Modify: package indexes and editability manifests.

**Interfaces:**

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

export interface ExecutorSwitchRepository {
  read(ownerId: string): { enabled: boolean; version: number };
  set(input: {
    ownerId: string;
    enabled: boolean;
    expectedVersion: number;
    actorId: string;
    reason: string;
    recentAuthProofId: string | null;
    now: string;
  }): boolean;
}
```

Rules:

- raw token at least 32 random bytes, returned once;
- registration binds approved isolation profile, public signing key IDs, repository target IDs and policy profile IDs;
- global executor enable is critical and requires recent auth;
- pause/revoke is immediate and invalidates active leases/attempt tokens;
- executor cannot modify its own registration/switch;
- credential rotation revokes previous token atomically.

- [ ] **Step 1: Write failing repository/server tests**

Cover one-time token, digest-only storage, same-owner target/policy, rotation, pause/revoke lease invalidation, critical enable and no self-management.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/database exec vitest run src/repositories/executor-registration-repository.test.ts src/repositories/executor-switch-repository.test.ts
pnpm --filter @semogtw/web exec vitest run src/server/devos-executors.test.ts
```

- [ ] **Step 3: Implement repositories and owner command handlers**

Use registered critical/high commands and approval/recent-auth infrastructure.

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/database test -- executor
pnpm --filter @semogtw/web test -- devos-executors
pnpm check:editability-coverage
git add packages/database/src apps/web/src/server packages/application/src
git commit -m "feat: add executor registration and shutdown controls"
git push
```

---

### Task 6: Implement atomic dispatch, lease and signed job creation

**Files:**
- Create: `packages/application/src/development-execution/lease.ts`
- Create: `packages/application/src/development-execution/lease.test.ts`
- Create job/attempt repositories/tests.
- Create: `packages/database/src/composition/development-executor-dispatch.ts`
- Create: `packages/database/src/composition/development-executor-dispatch.test.ts`
- Modify: indexes.

**Interfaces:**

```ts
export interface DevelopmentExecutorDispatch {
  queue(input: {
    requestId: string;
    executorId: string;
    approvalId: string;
    policyProfileId: string;
    agentAdapterId: string;
    networkPolicy: ExecutorNetworkPolicy;
    resourceLimits: ExecutorResourceLimits;
    correlationId: string;
    now: string;
  }): Promise<{ jobId: string }>;

  claim(input: {
    executorId: string;
    now: string;
  }): Promise<{
    job: SignedDevelopmentExecutorJob;
    attemptId: string;
    attemptToken: string;
    leaseExpiresAt: string;
  } | null>;

  heartbeat(input: {
    executorId: string;
    attemptId: string;
    attemptToken: string;
    sequence: number;
    now: string;
  }): Promise<boolean>;
}
```

Fixed lease:

```text
initial lease: 5 minutes
heartbeat interval: 30 seconds
lease extension: 2 minutes
maximum without progress/checkpoint: 30 minutes
job claim TTL: job payload expires 15 minutes after signing
```

Queue checks:

- executor/switch active;
- request `approved_for_development` with current version/base SHA;
- approved repository/policy/adapter;
- no active job for request;
- reservations/obligations active;
- approval hashes/current state valid;
- risk/network/secret refs within policy.

- [ ] **Step 1: Write failing lease tests**

Test claim exclusivity, heartbeat monotonicity, lease loss, pause/revoke, stale request/approval, duplicate queue/idempotency and expired signed job regeneration without changing payload state.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/application exec vitest run src/development-execution/lease.test.ts
pnpm --filter @semogtw/database exec vitest run src/composition/development-executor-dispatch.test.ts
```

- [ ] **Step 3: Implement transaction and Node signer adapter**

Signing private key is loaded from server secret by key ID; never persisted/logged. Store signed job only after all checks pass.

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/application test -- development-execution
pnpm --filter @semogtw/database test -- executor-dispatch
git add packages/application/src packages/database/src
git commit -m "feat: dispatch signed executor jobs"
git push
```

---

### Task 7: Build the private executor claim/heartbeat/result API

**Files:**
- Create: `apps/api/src/routes/private/executor-registration.ts`
- Create: `apps/api/src/routes/private/executor-jobs.ts`
- Create: `apps/api/src/routes/private/executor-jobs.test.ts`
- Modify: API router/composition and security middleware.

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

Authentication:

```text
Authorization: Bearer <executor-token>
```

Rules:

- token digest lookup before private job/database projection;
- attempt token required in a separate header after claim and compared by digest;
- TLS/canonical host/proxy policy required in production;
- body max 64 KiB except artifact metadata still max 64 KiB; artifact bytes use reviewed private storage pre-signed upload outside this API;
- no raw logs/diffs/environment in request;
- rate/concurrency limits per executor;
- private/no-store responses;
- stable sanitized errors;
- job/attempt/executor ID cross-binding;
- completion result is validated and cannot assert gates/commits absent from persisted checkpoints/evidence.

- [ ] **Step 1: Write failing route tests**

Cover missing/wrong/revoked token, claim isolation, attempt-token binding, replay, stale lease, size/rate/concurrency/no-store and secret markers.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/api exec vitest run src/routes/private/executor-jobs.test.ts
```

- [ ] **Step 3: Implement routes/middleware**

Do not reuse browser cookies/CSRF or MCP tokens.

- [ ] **Step 4: Run API/security tests and commit**

```bash
pnpm --filter @semogtw/api test
pnpm --filter @semogtw/api typecheck
git add apps/api/src
git commit -m "feat: add private executor job API"
git push
```

---

### Task 8: Create the Node executor package and fail-closed config

**Files:**
- Create: `packages/development-executor/package.json`
- Create: `packages/development-executor/tsconfig.json`
- Create: config/client/verifier files/tests from planned structure.
- Create: `packages/development-executor/src/index.ts`
- Modify: lockfile/test workspace.

**Configuration:**

```ts
export type DevelopmentExecutorConfig = {
  executorId: string;
  controlPlaneUrl: string;
  executorToken: string;
  trustedSigningKeys: Readonly<Record<string, string>>;
  workspaceRoot: string;
  cacheRoot: string;
  isolationProfile: "rootless_podman" | "rootless_docker" | "linux_bubblewrap";
  pollIntervalSeconds: number;
};
```

Rules:

- HTTPS required except explicit loopback tests;
- URL credentials/query/hash rejected;
- token non-empty and never printed;
- workspace/cache must be absolute, distinct, non-root, not home, no symlink after creation;
- signing keys are public Ed25519 PEM/JWK values only;
- poll 5..300 seconds;
- missing isolation executable/config disables worker before claim;
- process signal handling stops claim and releases/marks attempts safely.

- [ ] **Step 1: Write failing config/verifier/client tests**

Test unsafe URLs/paths, symlink, missing runtime, secret redaction, signed job verification, expired/wrong executor job and no claim before verification readiness.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/development-executor test
```

- [ ] **Step 3: Implement package/config/client/verifier**

HTTP client uses exact endpoints, timeouts and no redirect. It never logs response bodies on error.

- [ ] **Step 4: Run and commit**

```bash
pnpm install --lockfile-only
pnpm --filter @semogtw/development-executor test
pnpm --filter @semogtw/development-executor typecheck
git add packages/development-executor pnpm-lock.yaml vitest.workspace.ts
git commit -m "feat: add fail-closed development executor client"
git push
```

---

### Task 9: Implement isolated workspace and fixed Git operations

**Files:**
- Create: workspace/git/path-policy files/tests from planned structure.
- Modify: executor package index.

**Interfaces:**

```ts
export interface ExecutorWorkspace {
  prepare(input: {
    job: DevelopmentExecutorJobPayload;
    repositoryCredentialRef: string;
  }): Promise<{
    path: string;
    baseSha: string;
    workBranch: string;
  }>;
  cleanup(attemptId: string): Promise<void>;
}

export interface FixedGitRunner {
  verifyBase(input: WorkspaceGitContext): Promise<void>;
  createWorkBranch(input: WorkspaceGitContext): Promise<void>;
  currentHead(input: WorkspaceGitContext): Promise<string>;
  changedPaths(input: WorkspaceGitContext): Promise<readonly string[]>;
  commit(input: WorkspaceGitContext & { message: string }): Promise<string>;
  pushWorkBranch(input: WorkspaceGitContext): Promise<void>;
}
```

Fixed Git safety:

```text
GIT_CONFIG_NOSYSTEM=1
HOME points to empty executor temp dir
core.hooksPath=/dev/null
credential.helper disabled except one executor-owned askpass path for push/fetch
protocol.file.allow=never
submodule.recurse=false
fetch.fsckObjects=true
receive.fsckObjects=true
safe.directory exact workspace only
```

Allowed operations are hardcoded argv arrays. No method accepts arbitrary args. Clone/fetch remote comes from approved repository target/credential broker, not job URL text.

Path policy checks:

- normalized tracked/untracked/deleted/renamed paths;
- symlink target remains inside workspace or is denied;
- no `.git`, policy, executor-control or credential path modification unless explicitly scoped/critical-approved;
- every changed path matches at least one approved file/directory scope;
- case-collision checks on case-insensitive target profiles;
- maximum changed files/bytes from policy.

- [ ] **Step 1: Write failing path-policy tests**

Test traversal, symlink escape, rename across scope, deletion, untracked files, `.git`, case collision and valid nested scope.

- [ ] **Step 2: Write failing Git runner tests**

Use temporary local bare repositories. Test exact base, protected/default branch no push, fixed argv, hooks disabled, submodules ignored, credential redaction and cleanup.

- [ ] **Step 3: Run and verify failure**

```bash
pnpm --filter @semogtw/development-executor exec vitest run src/path-policy.test.ts src/git-runner.test.ts src/workspace.test.ts
```

- [ ] **Step 4: Implement through `execFile`, never shell**

All child processes use argv arrays, timeout, output bound and sanitized environment allowlist.

- [ ] **Step 5: Run and commit**

```bash
pnpm --filter @semogtw/development-executor exec vitest run src/path-policy.test.ts src/git-runner.test.ts src/workspace.test.ts
git add packages/development-executor/src
git commit -m "feat: isolate executor Git workspaces"
git push
```

---

### Task 10: Implement static agent adapters and sandbox invocation

**Files:**
- Create: `packages/development-executor/src/agent-adapters.ts`
- Create: `packages/development-executor/src/agent-adapters.test.ts`
- Create: `scripts/verify-executor-sandbox.mjs`
- Modify: executor config/index.

**Interfaces:**

```ts
export type AgentAdapterDefinition = {
  id: string;
  executable: string;
  argvTemplate: readonly string[];
  inputMode: "stdin_json" | "context_file";
  maximumOutputBytes: number;
};

export interface DevelopmentAgentAdapter {
  run(input: {
    job: DevelopmentExecutorJobPayload;
    workspacePath: string;
    context: {
      requestedOutcome: string;
      nonGoals: readonly string[];
      checkpoints: readonly string[];
      documentationRefs: readonly string[];
    };
    onProgress(event: AgentProgressEvent): Promise<void>;
    signal: AbortSignal;
  }): Promise<AgentRunResult>;
}
```

Rules:

- adapter registry is compiled/operator-configured, not job-controlled;
- executable/argv cannot contain job substitutions except fixed workspace/context-file placeholders escaped by the runner;
- model/provider credentials are secret refs mounted by host isolation and never included in context JSON;
- adapter process has no Git push/deploy credential;
- sandbox mount/network/resource policy comes from verified job/profile;
- repo content is untrusted data; control instructions/approved scopes are placed in an executor-owned read-only context file outside editable workspace;
- agent cannot edit that file;
- output/progress is bounded and treated as advisory until Git/gate observation verifies it.

- [ ] **Step 1: Write failing registry/invocation tests**

Test unknown adapter, caller-supplied executable/args ignored, context separation, secret redaction, timeout/cancel, output overflow and sandbox command construction without privileged mounts/sockets.

- [ ] **Step 2: Write the sandbox verification script**

It must attempt and expect failure for:

```text
read host home/.ssh
write outside workspace
access container runtime socket
spawn above process limit
exceed memory limit
network access under disabled policy
read unmounted secret
```

It must verify allowed workspace write and allowlisted-network behavior in the explicit network profile.

- [ ] **Step 3: Run and verify failure before implementation**

```bash
pnpm --filter @semogtw/development-executor exec vitest run src/agent-adapters.test.ts
node scripts/verify-executor-sandbox.mjs --profile <selected-profile>
```

- [ ] **Step 4: Implement adapter registry/invocation**

Do not include a generic `custom_command` adapter. Initial real adapter is selected explicitly during implementation from installed tooling and receives its own fixed definition/tests; otherwise use a deterministic fake for unit tests and keep real execution disabled.

- [ ] **Step 5: Run and commit**

```bash
pnpm --filter @semogtw/development-executor exec vitest run src/agent-adapters.test.ts
node scripts/verify-executor-sandbox.mjs --profile <selected-profile>
git add packages/development-executor/src scripts/verify-executor-sandbox.mjs
git commit -m "feat: run static agents inside verified sandbox"
git push
```

---

### Task 11: Implement checkpoint cadence, commits and controlled pushes

**Files:**
- Create checkpoint observer files/tests.
- Create or Modify job/attempt/checkpoint repositories and API route handling.
- Modify executor orchestration.

**Interfaces:**

```ts
export type ExecutorCheckpoint = {
  sequence: number;
  commitSha: string;
  observedAt: string;
  changedPaths: readonly string[];
  summary: string;
  requestCheckpointIds: readonly string[];
};

export interface CheckpointObserver {
  observeAndPush(input: {
    attemptId: string;
    workspace: WorkspaceGitContext;
    approvedPathScopes: readonly DevelopmentPathScope[];
    now: string;
    force: boolean;
  }): Promise<ExecutorCheckpoint | null>;
}
```

Rules:

- no changes → no synthetic commit/checkpoint;
- validate changed paths before commit;
- commit author is a dedicated executor identity; client/agent identity is recorded in trailers/audit, not impersonated;
- commit message bounded, no secrets/control characters;
- push only work branch and expected local head;
- server records checkpoint only after remote head observation confirms pushed SHA;
- max 30 minutes active time without checkpoint when changes exist; the executor requests an agent checkpoint/aborts according to policy;
- each checkpoint links Development Request/run ledger and updates current head through canonical command.

- [ ] **Step 1: Write failing cadence/path/push tests**

Test no-change, valid checkpoint, out-of-scope abort before commit, push failure, remote mismatch, timeout cadence and duplicate checkpoint idempotency.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/development-executor exec vitest run src/checkpoint-observer.test.ts
pnpm --filter @semogtw/database test -- executor-checkpoint
```

- [ ] **Step 3: Implement with credential broker**

Credential broker exposes an executor-owned askpass file/FD only during fetch/push. It does not return the secret string to the agent adapter or normal logs.

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/development-executor test -- checkpoint
pnpm --filter @semogtw/database test -- executor-checkpoint
git add packages/development-executor/src packages/database/src apps/api/src
git commit -m "feat: checkpoint and push executor progress safely"
git push
```

---

### Task 12: Run allowlisted gates and record exact-SHA evidence

**Files:**
- Create gate catalog/runner/result-validation files/tests.
- Modify executor/API/database composition.

**Interfaces:**

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

export interface ExecutorGateRunner {
  run(input: {
    gateId: string;
    workspacePath: string;
    commitSha: string;
    policy: DevelopmentExecutorPolicy;
    signal: AbortSignal;
  }): Promise<ExecutorGateResult>;
}
```

Rules:

- verify workspace clean and HEAD equals `commitSha` before/after gate;
- use fixed gate argv/cwd/timeout/output/network profile;
- environment allowlist excludes secrets except gate-specific mounted refs;
- classification uses deterministic exit/host signals plus operator-reviewed mappings; model text never determines `passed`;
- output is bounded/redacted; full logs, when retained, use private artifact storage with SHA-256/retention/access controls;
- submit result through existing exact-SHA verification command/service;
- a blocked environment gate does not become passed or code failure.

- [ ] **Step 1: Write failing catalog/runner tests**

Test unknown gate, changed HEAD, dirty worktree, timeout, output limit, network profile, exit mapping, secret redaction and exact-SHA result submission.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/development-executor exec vitest run src/gate-catalog.test.ts src/gate-runner.test.ts src/result-validation.test.ts
```

- [ ] **Step 3: Implement and integrate**

A gate result is accepted server-side only if the gate ID was required/allowed for the signed job and attempt/checkpoint SHA exists.

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/development-executor test -- gate
pnpm --filter @semogtw/database test -- executor-gate
pnpm --filter @semogtw/api test -- executor-jobs
git add packages/development-executor/src packages/database/src apps/api/src
git commit -m "feat: record exact-SHA executor gates"
git push
```

---

### Task 13: Extend GitHub adapter with exact repository/PR writes

**Files:**
- Create: `packages/github/src/write/pull-request-client.ts`
- Create: `packages/github/src/write/pull-request-client.test.ts`
- Create: `packages/github/src/write/index.ts`
- Modify: `packages/github/src/index.ts`
- Modify: package tests/security documentation.

**Interfaces:**

```ts
export type CreatePullRequestInput = {
  owner: string;
  repository: string;
  title: string;
  body: string;
  headBranch: string;
  baseBranch: string;
  expectedHeadSha: string;
  draft: boolean;
};

export type GitHubPullRequestRef = {
  number: number;
  htmlUrl: string;
  headSha: string;
  baseBranch: string;
  state: "open" | "closed";
  draft: boolean;
};

export interface GitHubPullRequestWriteClient {
  createPullRequest(input: CreatePullRequestInput): Promise<GitHubPullRequestRef>;
  getPullRequest(input: {
    owner: string;
    repository: string;
    number: number;
  }): Promise<GitHubPullRequestRef>;
}
```

Rules:

- separate write client/token configuration from existing read-only client;
- fine-grained token restricted to approved repository, Contents write and Pull requests write only;
- exact owner/repository from signed job/target;
- verify remote work-branch head equals expected SHA before PR create;
- base branch equals approved request base;
- title/body are bounded generated summaries; no raw logs/secrets/private prompts;
- redirects disabled, stable sanitized errors, rate limits handled;
- no merge/delete/default-branch/admin/issues/release methods in this plan.

- [ ] **Step 1: Write failing HTTP adapter tests**

Test exact endpoint/method/headers, wrong remote head, existing PR idempotency lookup, rate/permission/error sanitization and no token in error/log/result.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/github exec vitest run src/write/pull-request-client.test.ts
```

- [ ] **Step 3: Implement separate write adapter**

Do not broaden `GitHubRestClient` read methods or default token permission documentation.

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/github test
pnpm --filter @semogtw/github typecheck
git add packages/github/src
git commit -m "feat: add constrained GitHub pull request adapter"
git push
```

---

### Task 14: Complete jobs and open exact-head pull requests

**Files:**
- Modify executor orchestration/client/API/database composition.
- Create/modify PR persistence repository/tests.
- Modify Development Request services/read model.

**Completion preconditions:**

```text
agent process ended with accepted status
workspace clean
all changed paths in scope
current head pushed and remote-confirmed
required checkpoints recorded
all required gates passed on current head
job/request/approval/executor/switch still valid
```

Sequence:

```text
1. final checkpoint/push
2. run required gates on final SHA
3. revalidate request/approval/switch
4. create or reuse exact-head draft PR
5. store PR ref/head/base
6. transition job succeeded and request ready_for_review
7. release reservations according to reviewed policy or retain through merge review
8. append events/audit/receipt
```

Failure never marks request ready for review. A PR with mismatched head becomes stale and is not trusted.

- [ ] **Step 1: Write failing integration tests**

Test all preconditions, idempotent PR creation, remote-head mismatch, gate failure, switch/revocation race, DB failure after external PR success (saga records external success for reconciliation) and retry.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/development-executor test -- executor
pnpm --filter @semogtw/database test -- executor
pnpm --filter @semogtw/api test -- executor
```

- [ ] **Step 3: Implement explicit saga/reconciliation**

External PR success is recorded with request/job/idempotency key; retry searches/reuses matching head/base PR rather than creating duplicates.

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/development-executor test
pnpm --filter @semogtw/database test -- executor
pnpm --filter @semogtw/api test -- executor-jobs
git add packages/development-executor packages/database/src apps/api/src packages/domain/src/development
git commit -m "feat: finish executor jobs with exact-head pull requests"
git push
```

---

### Task 15: Add executor app loop and owner monitoring UI

**Files:**
- Create: `apps/development-executor/package.json`
- Create: `apps/development-executor/tsconfig.json`
- Create: `apps/development-executor/src/main.ts`
- Create routes/components/styles from planned structure.
- Modify DevOS navigation and workspace lockfile.

**Worker loop:**

```text
validate config/isolation
poll claim endpoint
verify signed job
prepare sandbox/workspace
heartbeat
run agent/checkpoint/gates
open PR/complete or report stable failure
cleanup sandbox/workspace/credential files
back off with jitter
```

Rules:

- one active job per worker process initially;
- graceful signal cancellation/lease release;
- no job body or token in logs;
- structured logs allow executor/job/attempt/correlation IDs, phase, duration, stable code only;
- cleanup runs in `finally` and on startup removes only expired executor-owned directories with marker validation.

Owner UI shows:

```text
executors/status/isolation profile/last heartbeat
write/dispatch kill switch
active/queued jobs
checkpoint timeline and exact SHAs
required gate results/classifications
PR linkage
bounded failure codes
credential rotation/pause/revoke
```

It never shows raw executor token, signing private key, Git token, model key, raw prompt/log/environment.

- [ ] **Step 1: Write failing worker-loop tests**

Use fake control plane/sandbox/agent/GitHub adapters. Test success, cancellation, lease loss, cleanup, backoff and no secret logging.

- [ ] **Step 2: Write failing web tests**

Test owner auth/CSRF, critical enable, status projection, rotation/revoke and 360 px timeline.

- [ ] **Step 3: Implement app/UI**

`apps/development-executor` depends on `@semogtw/development-executor`, not on web/database packages.

- [ ] **Step 4: Run and commit**

```bash
pnpm install --lockfile-only
pnpm --filter @semogtw/development-executor test
pnpm --filter @semogtw/development-executor typecheck
pnpm --filter @semogtw/web test -- executor
pnpm --filter @semogtw/web typecheck
git add apps/development-executor apps/web/src pnpm-lock.yaml
git commit -m "feat: add development executor worker and monitoring"
git push
```

---

### Task 16: Add permanent executor boundary guardrails

**Files:**
- Create: `scripts/check-development-executor-boundaries.mjs`
- Create: `scripts/check-development-executor-boundaries.test.mjs`
- Modify: `package.json`
- Modify: architecture/security docs.

**Guardrail failures:**

```text
raw child_process/shell outside @semogtw/development-executor fixed runner
exec()/shell=true/spawn with shell
UI/MCP importing executor internals
ordinary MCP tool names containing shell/sql/file/http/deploy
GitHub write methods outside packages/github/src/write
executor depending on apps/web, packages/database or browser auth
credential/token logging markers
container privileged/host socket/host network flags
policy gate argv containing shell interpreters
```

Add:

```json
{
  "check:development-executor-boundaries": "node scripts/check-development-executor-boundaries.mjs"
}
```

Include in `pnpm check`.

- [ ] **Step 1: Write failing fixture tests for every forbidden pattern**

- [ ] **Step 2: Implement AST/import/text-aware guardrail**

Use source parsing where semantic distinction matters; do not rely only on a broad regex that blocks legitimate tests/documentation.

- [ ] **Step 3: Run guardrails**

```bash
node scripts/check-development-executor-boundaries.test.mjs
pnpm check:development-executor-boundaries
pnpm check
```

- [ ] **Step 4: Commit**

```bash
git add scripts/check-development-executor-boundaries* package.json docs/ARCHITECTURE.md SECURITY.md
git commit -m "ci: enforce development executor boundaries"
git push
```

---

### Task 17: Verify sandbox, checkpoint, gates, PR and emergency shutdown E2E

**Files:**
- Create: `tests/e2e/development-executor-control.spec.ts`
- Modify: test matrix, architecture/data/MCP/security/deployment/runbook/changelog docs.

**Acceptance setup:**

- disposable private local/bare Git repository or dedicated test repository;
- rootless selected sandbox profile;
- deterministic fake agent adapter for mandatory CI;
- optional real installed agent acceptance recorded separately;
- fake GitHub HTTP server for mandatory tests; dedicated real test repository only under explicit owner approval.

**Scenarios:**

1. executor disabled cannot claim;
2. owner recent-auth enables reviewed executor;
3. approved request queues one signed job;
4. wrong key/executor/expired/mutated job is rejected;
5. sandbox denies host home/write/network/process abuse;
6. agent changes allowed path and checkpoint is pushed;
7. out-of-scope/symlink change aborts before push;
8. required gate passes/fails/blocks with exact classifications;
9. final clean exact-head job opens one draft PR;
10. duplicate completion reuses PR;
11. pause/revoke/kill switch cancels or prevents claim and removes credential access;
12. lease loss prevents late checkpoint/result;
13. logs/build/artifacts contain no synthetic secrets;
14. public output contains no job/repository/branch/path/SHA/gate/PR private state;
15. owner UI works at 360 px.

- [ ] **Step 1: Implement deterministic E2E harness**

Do not require live GitHub or a paid model for mandatory gates.

- [ ] **Step 2: Run complete gates**

```bash
node scripts/verify-executor-sandbox.mjs --profile <selected-profile>
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

- [ ] **Step 3: Scan secrets and prohibited execution surfaces**

```bash
rg -n "BEGIN.*PRIVATE KEY|github_pat_|ghp_|access_token|refresh_token|client_secret|executorToken|Authorization: Bearer|DOCKER_HOST|/var/run/docker.sock" \
  apps/*/dist test-results playwright-report logs docs/testing
rg -n "devos_.*(shell|sql|file|http|deploy)|shell: true|exec\(" packages apps
```

Expected: no secret values/generic tools/unsafe shell. Field names in server code/tests are reviewed separately.

- [ ] **Step 4: Rehearse emergency runbook**

Record exact evidence for:

```text
disable dispatch globally
pause/revoke executor
rotate executor token
revoke GitHub write credential
cancel active attempt
invalidate signing key
clean expired workspace safely
reconcile external PR after DB failure
retain request/checkpoints/gates after rollback
```

- [ ] **Step 5: Update documentation by reference and commit**

```bash
git add tests/e2e/development-executor-control.spec.ts \
  docs/testing/2026-08-03-development-executor-test-matrix.md \
  docs/architecture/DEVELOPMENT_CONTROL_PLANE.md docs/ARCHITECTURE.md \
  docs/DATA_MODEL.md docs/MCP.md SECURITY.md DEPLOYMENT.md RUNBOOK.md CHANGELOG.md
git commit -m "test: verify isolated development executor"
git push
```

## Acceptance criteria

This plan is complete only when:

- no executor enables without observed host sandbox evidence;
- jobs are immutable, signed, exact-scope and short-lived;
- executor identity/token is independent and revocable;
- ordinary UI/MCP exposes no raw shell/filesystem/Git/provider credential;
- static adapter/policy registries prevent caller-selected executables/argv;
- workspace/Git operations use fixed argv and no shell;
- all changed paths are validated before commit/push;
- checkpoint cadence and exact remote SHAs are observed;
- gates are allowlisted, exact-SHA and accurately classified;
- GitHub write adapter is limited to exact-head PR create/read;
- final job creates at most one draft PR and never merges;
- kill switches, lease loss, revocation and cleanup fail closed;
- mandatory tests require no paid model/live GitHub;
- sandbox, secret, boundary, confidentiality and full workspace gates pass.
