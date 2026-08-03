# Semogtw Deployment and Rollback Control Plane Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn an exact reviewed pull request/commit into a content-addressed artifact, controlled merge, preview deployment, observed health result and explicit rollback while keeping production disabled until a concrete host adapter is separately approved and verified.

**Architecture:** Add a provider-neutral deployment domain/application package and migration `0022`. GitHub merge is an exact-head high/critical command. Builds run through the verified isolation infrastructure and create immutable artifact manifests. Deployment adapters implement a strict typed port; the first required adapter is a rootless local-container preview. Production environments fail closed with `DEPLOYMENT_ADAPTER_UNAVAILABLE` until a provider-specific adapter passes the same contract and receives critical owner approval.

**Tech Stack:** Node.js 22, TypeScript strict mode, Zod, Vitest, SQLite/Drizzle, existing Development Executor/GitHub write adapter, Ed25519/canonical hashes where applicable, rootless Podman/Docker preview profile, TanStack Start/Router, Playwright.

## Global Constraints

- Implement only after the Development Request, approvals/change sets and isolated executor plans pass.
- Reconcile migration numbering; this plan reserves `0022_deployment_control.sql`.
- No production host/provider is assumed or claimed available.
- Production deployment remains globally disabled after migration and cannot be enabled without a registered provider adapter, observed capability evidence, recent owner authentication and critical approval.
- No generic remote shell, SSH command, arbitrary CI workflow, generic HTTP request or caller-supplied deployment command is exposed.
- Deployment adapters are statically registered code with strict typed inputs and bounded outputs.
- Merge, artifact creation, deployment and rollback are separate commands/states; success in one never implies success in the next.
- Merge is bound to exact PR number/head/base/repository and current required-gate evidence.
- Protected/default branch is changed only through the reviewed GitHub merge API adapter, never direct push.
- Artifact is built from an exact merged/reviewed SHA in an isolated clean workspace and identified by SHA-256 plus manifest.
- Artifact manifest contains no secrets and includes code SHA, lockfile hash, migration range, build command/profile, runtime requirements and files/content hashes.
- Environment configuration stores non-secret fingerprints and secret references only.
- Database migration deployment requires a verified backup, compatibility/forward-repair strategy and critical approval.
- Health checks are observed evidence, not model assertions.
- Deployment is not marked healthy merely because an adapter accepted a request.
- Rollback targets a known prior artifact/environment state; destructive data restore is a separate critical backup-restore command.
- Rollback cannot claim data/schema reversal unless it was actually performed and verified.
- Preview and production switches are independent; disabling deployment does not disable reads or the web app.
- Public output never contains private environment, secret ref, artifact storage, deployment, health or rollback details.
- Commit and push after each independently reviewable task.

---

## Planned file structure

```text
packages/application/src/deployment/
  types.ts
  environment-policy.ts
  environment-policy.test.ts
  artifact-manifest.ts
  artifact-manifest.test.ts
  lifecycle.ts
  lifecycle.test.ts
  health.ts
  health.test.ts
  rollback.ts
  rollback.test.ts
  index.ts

packages/deployment/
  package.json
  tsconfig.json
  src/index.ts
  src/ports.ts
  src/adapter-registry.ts
  src/adapter-registry.test.ts
  src/local-container-preview.ts
  src/local-container-preview.test.ts
  src/disabled-production-adapter.ts
  src/disabled-production-adapter.test.ts

packages/github/src/write/
  merge-client.ts
  merge-client.test.ts

packages/database/
  migrations/0022_deployment_control.sql
  src/schema/deployment-control.ts
  src/repositories/deployment-environment-repository.ts
  src/repositories/deployment-environment-repository.test.ts
  src/repositories/deployment-artifact-repository.ts
  src/repositories/deployment-artifact-repository.test.ts
  src/repositories/deployment-request-repository.ts
  src/repositories/deployment-request-repository.test.ts
  src/repositories/deployment-attempt-repository.ts
  src/repositories/deployment-attempt-repository.test.ts
  src/repositories/deployment-health-repository.ts
  src/repositories/deployment-health-repository.test.ts
  src/repositories/deployment-rollback-repository.ts
  src/repositories/deployment-rollback-repository.test.ts
  src/repositories/deployment-switch-repository.ts
  src/repositories/deployment-switch-repository.test.ts
  src/composition/merge-command-registry.ts
  src/composition/deployment-command-registry.ts
  src/composition/deployment-orchestrator.ts
  src/composition/deployment-orchestrator.test.ts

apps/api/src/routes/private/
  deployment-adapter-callbacks.ts
  deployment-adapter-callbacks.test.ts

apps/web/src/server/
  devos-deployments.ts
  devos-deployments.test.ts
  devos-deployment-environments.ts
  devos-deployment-environments.test.ts
  devos-rollbacks.ts
  devos-rollbacks.test.ts

apps/web/src/routes/
  devos.deployments.tsx
  devos.deployments.index.tsx
  devos.deployments.$deploymentId.tsx
  devos.deployments.environments.tsx

apps/web/src/components/devos/
  deployment-environment-card.tsx
  deployment-artifact-summary.tsx
  deployment-preview.tsx
  deployment-health-checks.tsx
  deployment-approval-form.tsx
  rollback-preview.tsx

apps/web/src/styles/
  deployments.css

scripts/
  build-deployment-artifact.mjs
  verify-deployment-artifact.mjs
  check-deployment-adapter-boundaries.mjs
  check-deployment-adapter-boundaries.test.mjs

packages/mcp/src/
  deployment-control-tools.ts
  deployment-control-tools.test.ts

tests/e2e/
  deployment-rollback-control.spec.ts

docs/testing/
  2026-08-03-deployment-rollback-test-matrix.md
```

---

### Task 1: Verify deployment prerequisites and record production as unavailable

**Files:**
- Create: `docs/testing/2026-08-03-deployment-rollback-test-matrix.md`
- Modify: `DEPLOYMENT.md`
- Modify: `docs/architecture/DEVELOPMENT_CONTROL_PLANE.md`
- Modify: `docs/superpowers/plans/2026-08-03-semogtw-agent-editability-plan-stack.md`

**Interfaces:**
- Consumes: exact-head PR/executor evidence, current host capability matrix and backup/runbook state.
- Produces: explicit preview/production capability decisions and migration reservation.

- [ ] **Step 1: Inspect prerequisites and migration state**

```bash
git fetch --all --prune
git status --short --branch
git rev-parse HEAD
ls packages/database/migrations | sort
rg -n "ready_for_review|approved_for_merge|pull request|executor|artifact|rollback" packages apps docs
rg -n "0022_deployment_control|0022_" packages/database/migrations docs/superpowers
```

- [ ] **Step 2: Re-run the deployment capability inventory**

Record observed values for:

```text
production host/provider selected
preview container runtime
persistent storage/migration procedure
server secrets
custom domain/TLS/proxy
logs/metrics
artifact storage
backup/restore
health-check endpoint
rollback mechanism
```

Expected initial state:

```text
local_container_preview: available or blocked with evidence
production_adapter: unavailable
production_deploy_enabled: false
```

Do not select a provider implicitly from installed connectors or documentation.

- [ ] **Step 3: Verify prerequisite gates**

```bash
pnpm check:development-executor-boundaries
pnpm check:editability-coverage
pnpm --filter @semogtw/development-executor test
pnpm --filter @semogtw/github test
pnpm --filter @semogtw/database test
```

- [ ] **Step 4: Update `DEPLOYMENT.md` by reference**

Add the planned deployment-control boundary and keep production explicitly unauthorized. Do not copy the full specification/plan.

- [ ] **Step 5: Commit**

```bash
git add docs/testing/2026-08-03-deployment-rollback-test-matrix.md \
  DEPLOYMENT.md docs/architecture/DEVELOPMENT_CONTROL_PLANE.md \
  docs/superpowers/plans/2026-08-03-semogtw-agent-editability-plan-stack.md
git commit -m "docs: establish deployment adapter gate"
git push
```

---

### Task 2: Define environment, deployment and rollback contracts

**Files:**
- Create: `packages/application/src/deployment/types.ts`
- Create: `packages/application/src/deployment/environment-policy.ts`
- Create: `packages/application/src/deployment/environment-policy.test.ts`
- Create: `packages/application/src/deployment/index.ts`
- Modify: `packages/application/src/index.ts`

**Interfaces:**

```ts
export type DeploymentEnvironmentKind = "preview" | "production";

export type DeploymentEnvironment = {
  id: string;
  ownerId: string;
  name: string;
  kind: DeploymentEnvironmentKind;
  adapterId: string;
  adapterVersion: number;
  canonicalUrl: string | null;
  secretRefs: readonly string[];
  nonSecretConfigFingerprint: string;
  migrationPolicy:
    | "none"
    | "additive_only"
    | "reviewed_forward_repair";
  enabled: boolean;
  version: number;
};

export type DeploymentStatus =
  | "draft"
  | "prepared"
  | "approval_required"
  | "approved"
  | "deploying"
  | "deployed_unverified"
  | "healthy"
  | "unhealthy"
  | "failed"
  | "rollback_pending"
  | "rolled_back"
  | "cancelled";

export type RollbackStatus =
  | "draft"
  | "approval_required"
  | "approved"
  | "executing"
  | "rolled_back_unverified"
  | "healthy"
  | "failed"
  | "cancelled";

export function classifyDeploymentRisk(input: {
  environmentKind: DeploymentEnvironmentKind;
  includesMigrations: boolean;
  includesAuthOrAuthorization: boolean;
  includesSecretReferenceChanges: boolean;
  previousArtifactKnown: boolean;
}): "medium" | "high" | "critical";

export function validateDeploymentEnvironment(
  value: DeploymentEnvironment,
): DeploymentEnvironment;
```

Risk:

```text
preview, no migration/security effect → medium/high according to visibility
production → at least high
production + migration/auth/authorization/secret change → critical
unknown previous artifact → critical
rollback with data restore/destructive operation → critical separate command
```

- [ ] **Step 1: Write failing policy tests**

Test HTTPS canonical URL, no URL credentials/query secrets, bounded secret refs/config fingerprint, production disabled without non-disabled adapter capability and risk matrix.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/application exec vitest run src/deployment/environment-policy.test.ts
```

- [ ] **Step 3: Implement pure contracts/policy**

No provider, filesystem, container or database imports.

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/application exec vitest run src/deployment/environment-policy.test.ts
pnpm --filter @semogtw/application typecheck
git add packages/application/src
git commit -m "feat: define deployment environment policy"
git push
```

---

### Task 3: Define immutable artifact manifests

**Files:**
- Create: `packages/application/src/deployment/artifact-manifest.ts`
- Create: `packages/application/src/deployment/artifact-manifest.test.ts`
- Create: `scripts/build-deployment-artifact.mjs`
- Create: `scripts/verify-deployment-artifact.mjs`
- Modify: package scripts.

**Interfaces:**

```ts
export type DeploymentArtifactManifest = {
  schemaVersion: 1;
  artifactId: string;
  repositoryFullName: string;
  commitSha: string;
  sourcePullRequestNumber: number;
  lockfileSha256: string;
  policyProfileId: string;
  policyProfileVersion: number;
  buildGateId: string;
  buildStartedAt: string;
  buildFinishedAt: string;
  runtime: {
    nodeRange: string;
    packageManager: string;
  };
  migrations: readonly {
    name: string;
    sha256: string;
  }[];
  files: readonly {
    path: string;
    sha256: string;
    sizeBytes: number;
  }[];
  artifactSha256: string;
  artifactSizeBytes: number;
};

export function validateDeploymentArtifactManifest(
  value: DeploymentArtifactManifest,
): DeploymentArtifactManifest;
```

Build requirements:

- clean isolated workspace at exact SHA;
- frozen lockfile install and approved build gate;
- deterministic archive ordering, normalized timestamps/permissions where format permits;
- include only allowlisted server/client/static/migration outputs;
- exclude source `.git`, environment, caches, test results, secrets and local database;
- artifact max configured bound;
- artifact bytes stored in reviewed private storage; DB stores reference/hash/manifest only.

- [ ] **Step 1: Write failing manifest tests**

Test exact SHA/hash lengths, unique normalized file/migration paths, no traversal/symlink/secret markers, total size consistency and manifest hash stability.

- [ ] **Step 2: Write failing script fixture tests**

Test deterministic repeated build, dirty workspace rejection, wrong HEAD, forbidden file exclusion and tamper verification failure.

- [ ] **Step 3: Run and verify failure**

```bash
pnpm --filter @semogtw/application exec vitest run src/deployment/artifact-manifest.test.ts
node scripts/verify-deployment-artifact.mjs --self-test
```

- [ ] **Step 4: Implement using the verified executor sandbox/gate runner**

The script accepts exact controlled flags from the orchestrator, not arbitrary build commands.

- [ ] **Step 5: Run and commit**

```bash
pnpm --filter @semogtw/application exec vitest run src/deployment/artifact-manifest.test.ts
node scripts/verify-deployment-artifact.mjs --self-test
git add packages/application/src scripts/build-deployment-artifact.mjs scripts/verify-deployment-artifact.mjs package.json
git commit -m "feat: add immutable deployment artifacts"
git push
```

---

### Task 4: Add migration 0022 and deployment persistence

**Files:**
- Create: `packages/database/migrations/0022_deployment_control.sql`
- Create: `packages/database/src/schema/deployment-control.ts`
- Modify: schema/index exports.
- Create migration tests.
- Modify backup/restore tests.

**Tables:**

```text
deployment_environments
deployment_environment_secret_refs
deployment_adapter_capability_evidence
deployment_artifacts
deployment_artifact_files
deployment_artifact_migrations
deployment_requests
deployment_attempts
deployment_health_checks
deployment_rollbacks
deployment_events
deployment_switches
```

Required relations:

```text
artifact.commit_sha/PR → executor PR/development request refs
deployment.environment_id → environments
deployment.artifact_id → artifacts
rollback.target_artifact_id → known artifacts
approval/receipt IDs → command tables
```

Security/invariants:

- environment adapter ID/version immutable while an active deployment exists; replacement creates a new environment version/record;
- production environment disabled by default;
- separate preview/production switches default disabled for production, preview according to owner setup;
- no raw secret/config body/provider credential/remote command/log/blob columns;
- artifact manifest/hash immutable;
- one active deployment attempt per environment;
- health observations append-only;
- rollback never deletes deployment history;
- provider capability evidence records date/version/bounded result, not credentials.

- [ ] **Step 1: Write failing migration tests**

Test constraints/FKs/indexes/default switches/no secret or command columns/repeated migration application.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/database exec vitest run src/deployment-control-migrations.test.ts src/adapters/sqlite-migrations.test.ts
```

- [ ] **Step 3: Implement migration/schema and backup tests**

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/database exec vitest run \
  src/deployment-control-migrations.test.ts \
  src/adapters/sqlite-migrations.test.ts \
  src/backup/sqlite-backup.test.ts
pnpm --filter @semogtw/database typecheck
git add packages/database
git commit -m "feat: add deployment control persistence"
git push
```

---

### Task 5: Implement environment/artifact/deployment repositories

**Files:**
- Create repository/test files listed in planned structure.
- Modify database exports.

**Interfaces:**

```ts
export interface DeploymentEnvironmentRepository {
  create(input: CreateDeploymentEnvironmentRecord): DeploymentEnvironmentRecord;
  findForOwner(input: {
    ownerId: string;
    environmentId: string;
  }): DeploymentEnvironmentRecord | null;
  setEnabled(input: SetDeploymentEnvironmentEnabledRecord): boolean;
  recordCapabilityEvidence(input: RecordAdapterCapabilityEvidence): boolean;
}

export interface DeploymentArtifactRepository {
  create(input: CreateDeploymentArtifactRecord): DeploymentArtifactRecord;
  findBySha(input: {
    ownerId: string;
    artifactSha256: string;
  }): DeploymentArtifactRecord | null;
}

export interface DeploymentRequestRepository {
  create(input: CreateDeploymentRequestRecord): DeploymentRequestRecord;
  beginAttempt(input: BeginDeploymentAttemptRecord): DeploymentAttemptRecord | null;
  markAdapterAccepted(input: AdapterAcceptedDeploymentRecord): boolean;
  recordHealth(input: RecordDeploymentHealthRecord): boolean;
  complete(input: CompleteDeploymentRecord): boolean;
  fail(input: FailDeploymentRecord): boolean;
}
```

Rules:

- owner/environment/artifact exact binding;
- environment adapter capability evidence required before enable;
- production enable uses recent-auth proof/critical approval through command composition;
- artifact record creation verifies manifest/hash/storage metadata;
- deployment request freezes artifact/environment/config fingerprint/migration plan;
- one attempt/idempotency key;
- adapter acceptance is `deployed_unverified`, not healthy;
- healthy only after required checks pass;
- all transitions append events/audit.

- [ ] **Step 1: Write failing repository tests**

Test owner isolation, immutable artifact, capability gate, optimistic enable, attempt uniqueness, health state, rollback history and transaction failures.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/database exec vitest run src/repositories/deployment-*.test.ts
```

- [ ] **Step 3: Implement repositories**

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/database exec vitest run src/repositories/deployment-*.test.ts
pnpm --filter @semogtw/database typecheck
git add packages/database/src
git commit -m "feat: add deployment repositories"
git push
```

---

### Task 6: Add exact-head GitHub merge adapter

**Files:**
- Create: `packages/github/src/write/merge-client.ts`
- Create: `packages/github/src/write/merge-client.test.ts`
- Modify: `packages/github/src/write/index.ts`
- Modify: `packages/github/src/index.ts`

**Interfaces:**

```ts
export type MergePullRequestInput = {
  owner: string;
  repository: string;
  pullRequestNumber: number;
  expectedHeadSha: string;
  expectedBaseBranch: string;
  method: "merge" | "squash" | "rebase";
  commitTitle: string;
  commitMessage: string;
};

export type MergePullRequestResult = {
  merged: boolean;
  mergeSha: string | null;
  messageCode: string;
};

export interface GitHubMergeWriteClient {
  verifyPullRequest(input: MergePullRequestInput): Promise<{
    headSha: string;
    baseBranch: string;
    state: "open" | "closed";
    draft: boolean;
    mergeable: boolean | null;
  }>;
  mergePullRequest(input: MergePullRequestInput): Promise<MergePullRequestResult>;
}
```

Rules:

- exact repository/PR/head/base from persisted Development Request/PR record;
- request must be `approved_for_merge`, required gates passed on exact head and approval current;
- no draft/closed/mismatched/unmergeable PR;
- expected head sent to GitHub merge endpoint where supported and rechecked immediately before call;
- merge token separate from read/PR-create token if permissions demand, fine-grained exact repo;
- no direct protected branch push/delete/admin/default branch methods;
- stable errors and no token/provider body in logs/results.

- [ ] **Step 1: Write failing adapter tests**

Test exact HTTP request, stale head/base, draft/closed, unknown mergeability policy, 409/422/rate errors, idempotent already-merged reconciliation and secret sanitization.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/github exec vitest run src/write/merge-client.test.ts
```

- [ ] **Step 3: Implement constrained adapter**

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/github test
pnpm --filter @semogtw/github typecheck
git add packages/github/src
git commit -m "feat: add exact-head GitHub merge adapter"
git push
```

---

### Task 7: Register merge and artifact preparation commands

**Files:**
- Create: `packages/application/src/deployment/lifecycle.ts`
- Create: `packages/application/src/deployment/lifecycle.test.ts`
- Create command adapters/tests under `packages/application/src/deployment/commands/`.
- Create: `packages/database/src/composition/merge-command-registry.ts`
- Modify command registry/manifests/coverage.

**Commands:**

```text
development.merges.approve
  high; critical when migrations/auth/authorization/secrets flags exist

development.merges.execute
  high/critical; DevOS approval required; exact PR head/base

deployment.artifacts.prepare
  high; exact merge/reviewed SHA and successful build gate
```

Rules:

- approval and execution remain separate;
- `execute` revalidates PR/request/gates/permissions/switches;
- external merge success uses saga reconciliation if DB update fails;
- merge result becomes an exact observed SHA before request status changes to `merged`;
- artifact build begins only from merged/reviewed SHA approved by environment policy;
- no deployment starts here.

- [ ] **Step 1: Write failing command/lifecycle tests**

Test risk escalation, exact bindings, stale approval, merge saga/reconciliation, no artifact from dirty/unmerged SHA and manifests.

- [ ] **Step 2: Implement adapters/composition**

- [ ] **Step 3: Run gates**

```bash
pnpm --filter @semogtw/application test -- deployment
pnpm --filter @semogtw/database test -- merge-command
pnpm --filter @semogtw/github test
pnpm check:editability-coverage
```

- [ ] **Step 4: Commit**

```bash
git add packages/application/src/deployment packages/database/src/composition \
  docs/architecture/EDITABILITY_COVERAGE.md
git commit -m "feat: register merge and artifact commands"
git push
```

---

### Task 8: Create strict deployment adapter ports and registry

**Files:**
- Create: `packages/deployment/package.json`
- Create: `packages/deployment/tsconfig.json`
- Create: `packages/deployment/src/ports.ts`
- Create: `packages/deployment/src/adapter-registry.ts`
- Create: `packages/deployment/src/adapter-registry.test.ts`
- Create: `packages/deployment/src/disabled-production-adapter.ts`
- Create: `packages/deployment/src/disabled-production-adapter.test.ts`
- Create: `packages/deployment/src/index.ts`
- Modify workspace lockfile/tests.

**Interfaces:**

```ts
export type DeploymentAdapterCapabilities = {
  environmentKinds: readonly DeploymentEnvironmentKind[];
  supportsMigrations: boolean;
  supportsHealthChecks: boolean;
  supportsTrafficSwitch: boolean;
  supportsArtifactRollback: boolean;
  supportsConfigFingerprint: boolean;
};

export type DeploymentAdapterInput = {
  deploymentId: string;
  environment: DeploymentEnvironment;
  artifact: DeploymentArtifactManifest;
  artifactStorageRef: string;
  secretRefs: readonly string[];
  previousArtifactId: string | null;
  callback: {
    url: string;
    oneTimeToken: string;
  };
};

export interface DeploymentAdapter {
  id: string;
  version: number;
  capabilities: DeploymentAdapterCapabilities;
  deploy(input: DeploymentAdapterInput): Promise<{
    providerOperationId: string;
    observedUrl: string | null;
  }>;
  checkHealth(input: {
    providerOperationId: string;
    environment: DeploymentEnvironment;
  }): Promise<readonly DeploymentHealthObservation[]>;
  rollback(input: {
    rollbackId: string;
    environment: DeploymentEnvironment;
    targetArtifact: DeploymentArtifactManifest;
    targetStorageRef: string;
    secretRefs: readonly string[];
  }): Promise<{ providerOperationId: string }>;
}

export class DeploymentAdapterRegistry {
  constructor(adapters: readonly DeploymentAdapter[]);
  resolve(input: {
    adapterId: string;
    adapterVersion: number;
    environmentKind: DeploymentEnvironmentKind;
  }): DeploymentAdapter | null;
}
```

Rules:

- unique ID/version;
- static code registry, no dynamic package name/executable/URL from database;
- adapter inputs strictly bounded and secret refs opaque;
- production registry initially contains only `disabled-production` which always returns `DEPLOYMENT_ADAPTER_UNAVAILABLE` and cannot be enabled as evidence;
- provider callback token is one-time/digest-only and adapter cannot return secrets/log bodies.

- [ ] **Step 1: Write failing registry/disabled tests**

Test duplicates, capability mismatch, unknown version/environment, bounded outputs and guaranteed production failure.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/deployment test
```

- [ ] **Step 3: Implement package/ports/registry**

- [ ] **Step 4: Run and commit**

```bash
pnpm install --lockfile-only
pnpm --filter @semogtw/deployment test
pnpm --filter @semogtw/deployment typecheck
git add packages/deployment pnpm-lock.yaml vitest.workspace.ts
git commit -m "feat: add deployment adapter contracts"
git push
```

---

### Task 9: Implement rootless local-container preview adapter

**Files:**
- Create: `packages/deployment/src/local-container-preview.ts`
- Create: `packages/deployment/src/local-container-preview.test.ts`
- Modify registry/index.
- Create sandbox fixture/config files as required.

**Adapter ID:**

```text
local_container_preview@1
```

Capabilities:

```text
environmentKinds: preview only
migrations: disposable preview database only
health checks: yes
traffic switch: no
artifact rollback: yes by replacing preview container
config fingerprint: yes
```

Safety:

- rootless selected Podman/Docker profile only;
- no privileged/host network/PID/socket mounts;
- artifact mounted/read-only or unpacked into executor-owned isolated directory after hash verification;
- writable ephemeral data volume separate from production data;
- loopback/random reviewed port only;
- no production secret refs; preview-specific allowlist;
- fixed image/runtime/entry argv from adapter code/profile, not input;
- CPU/memory/process/wall-time limits;
- container labels bind deployment/environment/artifact and cleanup;
- readiness/health endpoints queried over loopback with timeout/body bound/no redirects;
- rollback replaces container with target artifact and re-runs health.

- [ ] **Step 1: Write failing command-construction/unit tests**

Test no privileged/socket/host mounts/network, exact artifact hash, secret ref allowlist, port allocation, labels, timeout/cleanup and rollback target.

- [ ] **Step 2: Write runtime acceptance script/test**

Deploy a tiny deterministic fixture artifact, observe health, replace with unhealthy artifact, roll back and verify healthy target. Skip only with explicit `external_environment` classification when no reviewed rootless runtime exists; adapter remains disabled then.

- [ ] **Step 3: Run and verify failure**

```bash
pnpm --filter @semogtw/deployment exec vitest run src/local-container-preview.test.ts
```

- [ ] **Step 4: Implement using fixed `execFile` argv**

No shell/string command construction.

- [ ] **Step 5: Run and commit**

```bash
pnpm --filter @semogtw/deployment exec vitest run src/local-container-preview.test.ts
pnpm --filter @semogtw/deployment typecheck
git add packages/deployment/src
git commit -m "feat: add isolated local preview deployments"
git push
```

---

### Task 10: Implement health evaluation and deployment lifecycle

**Files:**
- Create: `packages/application/src/deployment/health.ts`
- Create: `packages/application/src/deployment/health.test.ts`
- Create/complete lifecycle tests.
- Modify database repositories/composition.

**Interfaces:**

```ts
export type DeploymentHealthObservation = {
  checkId: string;
  kind: "http" | "process" | "database" | "confidentiality" | "custom_adapter";
  observedAt: string;
  status: "passed" | "failed" | "blocked";
  durationMs: number;
  stableCode: string;
  boundedSummary: string;
};

export type DeploymentHealthPolicy = {
  requiredCheckIds: readonly string[];
  minimumConsecutivePasses: number;
  observationWindowSeconds: number;
};

export function evaluateDeploymentHealth(input: {
  policy: DeploymentHealthPolicy;
  observations: readonly DeploymentHealthObservation[];
}): "pending" | "healthy" | "unhealthy" | "blocked";
```

Baseline preview checks:

```text
process_running
private_login_protected
public_home_200
health_endpoint_200
public_confidentiality_markers_absent
migration_integrity
```

Production adapter must define additional host-specific checks before registration.

- [ ] **Step 1: Write failing health/lifecycle tests**

Test missing checks, consecutive passes, failed/blocked precedence, stale observations, deployed-unverified state and healthy transition only after policy.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/application exec vitest run src/deployment/health.test.ts src/deployment/lifecycle.test.ts
```

- [ ] **Step 3: Implement evaluation and repository transitions**

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/application test -- deployment
pnpm --filter @semogtw/database test -- deployment
git add packages/application/src/deployment packages/database/src
git commit -m "feat: evaluate deployment health explicitly"
git push
```

---

### Task 11: Implement deployment orchestration and switches

**Files:**
- Create: `packages/database/src/composition/deployment-orchestrator.ts`
- Create: `packages/database/src/composition/deployment-orchestrator.test.ts`
- Create/complete deployment switch repository/tests.
- Create callback API route/tests.

**Interfaces:**

```ts
export interface DeploymentOrchestrator {
  prepare(input: PrepareDeploymentInput): Promise<{
    deploymentId: string;
    approvalId: string;
  }>;
  execute(input: ExecuteDeploymentInput): Promise<DeploymentExecutionResult>;
  reconcile(input: ReconcileDeploymentInput): Promise<DeploymentExecutionResult>;
}
```

Prepare sequence:

```text
verify environment/adapter capability/switch
verify artifact/commit/PR/development request
classify risk and migration/security effects
verify backup/rollback target when required
freeze deployment input/config fingerprint
create approval
```

Execute/reconcile sequence:

```text
revalidate approval/current state/switch
begin attempt and one-time callback token
invoke exact adapter
record adapter acceptance as deployed_unverified
collect/persist health checks
mark healthy/unhealthy/blocked
on DB failure after provider success, persist/recover via operation id/idempotency reconciliation
```

Switches:

```text
preview global/environment
production global/environment
```

Production enable is critical/recent-auth and impossible while adapter is disabled/unverified.

- [ ] **Step 1: Write failing orchestrator tests**

Test unavailable production, preview success/health, adapter accept then DB failure reconciliation, switch race, approval stale, artifact/config mismatch and callback authentication/replay.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/database exec vitest run src/composition/deployment-orchestrator.test.ts
pnpm --filter @semogtw/api exec vitest run src/routes/private/deployment-adapter-callbacks.test.ts
```

- [ ] **Step 3: Implement composition/callback**

Callback token digest-only, one-time, deployment/attempt/adapter bound, short-lived and not used for other API access.

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/database test -- deployment-orchestrator
pnpm --filter @semogtw/api test -- deployment-adapter-callbacks
git add packages/database/src apps/api/src
git commit -m "feat: orchestrate approved deployments"
git push
```

---

### Task 12: Implement explicit artifact rollback

**Files:**
- Create: `packages/application/src/deployment/rollback.ts`
- Create: `packages/application/src/deployment/rollback.test.ts`
- Create/complete rollback repository/tests.
- Modify orchestrator.

**Interfaces:**

```ts
export type RollbackPlan = {
  environmentId: string;
  currentDeploymentId: string;
  currentArtifactId: string;
  targetDeploymentId: string;
  targetArtifactId: string;
  schemaCompatibility:
    | "compatible"
    | "forward_repair_required"
    | "data_restore_required"
    | "unknown";
  expectedEffects: readonly string[];
  risk: "high" | "critical";
};

export function prepareRollbackPlan(input: {
  current: DeploymentStateSnapshot;
  target: DeploymentStateSnapshot;
  migrationCompatibility: MigrationCompatibilityResult;
}): RollbackPlan;
```

Rules:

- target must be known previously verified artifact/environment;
- production rollback at least high; migration/auth/secret/unknown/restore critical;
- `data_restore_required` does not execute through artifact rollback; it creates/links a separate backup-restore approval/runbook action;
- adapter rollback acceptance becomes `rolled_back_unverified` until health checks pass;
- current failed deployment/history remains immutable;
- rollback failure does not claim previous state restored.

- [ ] **Step 1: Write failing plan/repository/orchestrator tests**

Test compatible artifact rollback, unknown target, migration incompatibility, data restore separation, health verification, repeated rollback/idempotency and partial provider result.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/application exec vitest run src/deployment/rollback.test.ts
pnpm --filter @semogtw/database test -- deployment-rollback
```

- [ ] **Step 3: Implement and run**

```bash
pnpm --filter @semogtw/application test -- deployment
pnpm --filter @semogtw/database test -- deployment
```

- [ ] **Step 4: Commit**

```bash
git add packages/application/src/deployment packages/database/src
git commit -m "feat: add explicit artifact rollback workflow"
git push
```

---

### Task 13: Build owner deployment/rollback UI

**Files:**
- Create server/route/component/style files from planned structure.
- Modify DevOS navigation/read models.

**Owner flows:**

```text
Review artifact manifest and exact source SHA/PR
Select enabled environment
See adapter capability/evidence and current artifact
Preview migration/config/health/rollback effects
Prepare approval
Recent-auth critical approval when required
Execute deployment
Observe adapter acceptance and health separately
Prepare/approve/execute rollback
Pause preview/production deployment switches
```

UI requirements:

- production visibly unavailable while no adapter is registered/verified;
- no “Deploy production” control that merely fails after collecting data;
- exact distinction: prepared, deploying, deployed-unverified, healthy, unhealthy, rollback pending, rolled-back-unverified, healthy;
- artifact/migration/config fingerprints under advanced disclosure;
- secret refs shown only as names/availability, never values;
- 360 px card/timeline layout.

- [ ] **Step 1: Write failing server tests**

Test owner auth/CSRF, environment/artifact binding, approval/recent-auth, production unavailable, switch, idempotency and stable errors.

- [ ] **Step 2: Write failing component tests**

Test state copy, unavailable production, health list, rollback effects/non-reversibility and mobile layout.

- [ ] **Step 3: Implement through canonical commands/read models**

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/web test -- deployment
pnpm --filter @semogtw/web typecheck
git add apps/web/src
git commit -m "feat: add deployment and rollback controls"
git push
```

---

### Task 14: Add specific MCP deployment control tools after gates

**Files:**
- Create: `packages/mcp/src/deployment-control-tools.ts`
- Create: `packages/mcp/src/deployment-control-tools.test.ts`
- Modify MCP registry/composition/manifests.

**Tools:**

```text
devos_get_deployment_status
devos_get_deployment_artifact
devos_prepare_deployment
devos_prepare_rollback
devos_request_deployment_approval
devos_request_rollback_approval
```

Execution tools are intentionally approval-driven:

```text
devos_execute_approved_deployment
devos_execute_approved_rollback
```

Rules:

- no generic adapter config/command/URL/secret input;
- exact environment/artifact/deployment/approval IDs;
- prepare/request commands require scoped capabilities/switches;
- production/critical execution remains DevOS-approved/recent-auth, never client confirmation alone;
- disabled/unavailable adapter returns stable state, not fallback execution;
- bounded/sanitized output and filtered discovery.

- [ ] **Step 1: Write failing tool tests**

Test scopes/grants/resources, production unavailable, approval requirement, stale approval, idempotency and no generic deployment tool.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/mcp exec vitest run src/deployment-control-tools.test.ts
```

- [ ] **Step 3: Implement only after remote MCP write gates pass**

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/mcp test
pnpm check:mcp-package-boundaries
pnpm check:mcp-transport-boundary
git add packages/mcp apps/mcp apps/mcp-http
git commit -m "feat: add approval-driven deployment tools"
git push
```

---

### Task 15: Add deployment adapter boundary guardrails

**Files:**
- Create: `scripts/check-deployment-adapter-boundaries.mjs`
- Create: `scripts/check-deployment-adapter-boundaries.test.mjs`
- Modify: `package.json`
- Modify security/architecture docs.

**Guardrail failures:**

```text
shell/exec/string commands in deployment adapters
caller/database-provided executable/argv/module import
SSH/generic HTTP adapter without a dedicated approved adapter module
production environment using disabled/local-preview adapter
adapter reading raw browser/MCP payloads
secret values in DB/log/result DTOs
container privileged/host network/socket mounts
production enable without capability evidence/approval/recent-auth
merge/direct push methods outside constrained GitHub write package
```

Add to `pnpm check`.

- [ ] **Step 1: Write failing fixture tests**

- [ ] **Step 2: Implement guardrail**

Use parsing/structured registry inspection where possible.

- [ ] **Step 3: Run and commit**

```bash
node scripts/check-deployment-adapter-boundaries.test.mjs
pnpm check:deployment-adapter-boundaries
pnpm check
git add scripts/check-deployment-adapter-boundaries* package.json docs/ARCHITECTURE.md SECURITY.md
git commit -m "ci: enforce deployment adapter boundaries"
git push
```

---

### Task 16: Verify merge, artifact, preview, health and rollback E2E

**Files:**
- Create: `tests/e2e/deployment-rollback-control.spec.ts`
- Modify test matrix, architecture/data/MCP/security/deployment/runbook/changelog docs.

**Mandatory deterministic scenarios:**

1. reviewed exact-head PR cannot merge without approval;
2. stale PR head/base/gates blocks merge;
3. approved merge records exact merge SHA once;
4. clean exact-SHA artifact builds and verifies; tamper fails;
5. production environment remains unavailable/disabled;
6. preview deployment is prepared/approved/executed through local adapter;
7. adapter acceptance shows deployed-unverified;
8. required health checks transition to healthy;
9. unhealthy artifact triggers rollback preparation, not silent rollback;
10. approved rollback restores known preview artifact and passes health;
11. data-restore-required rollback stops and links separate critical action;
12. switches stop new deploy/rollback without disabling reads;
13. duplicate requests are idempotent/reconciled;
14. secret scans/public confidentiality pass;
15. owner UI works at 360 px.

- [ ] **Step 1: Implement E2E with fake GitHub and rootless preview fixture**

Mandatory tests do not require a live production provider. Real provider acceptance belongs to a separate adapter-specific plan after host selection.

- [ ] **Step 2: Run complete gates**

```bash
pnpm check:deployment-adapter-boundaries
pnpm check:development-executor-boundaries
pnpm check:editability-coverage
pnpm check:public-confidentiality
pnpm --filter @semogtw/application test
pnpm --filter @semogtw/deployment test
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/github test
pnpm --filter @semogtw/mcp test
pnpm --filter @semogtw/web test
pnpm --filter @semogtw/web typecheck
pnpm --filter @semogtw/web build
pnpm exec playwright test tests/e2e/deployment-rollback-control.spec.ts
pnpm check
pnpm build
```

- [ ] **Step 3: Rehearse preview emergency runbook**

Record:

```text
disable preview/production independently
cancel deployment attempt
invalidate callback token
stop/remove preview container
verify artifact before reuse
roll back to known artifact
reconcile provider success after DB failure
revoke deployment credentials/secret refs
retain immutable history
```

- [ ] **Step 4: Scan forbidden data/surfaces**

```bash
rg -n "PRIVATE KEY|github_pat_|ghp_|access_token|refresh_token|client_secret|Authorization:|ssh .*@|shell: true|exec\(" \
  apps/*/dist packages/deployment test-results playwright-report logs
rg -n "devos_.*(shell|http|ssh|command)|raw.*secret|provider.*token" packages/mcp apps/web/src
```

- [ ] **Step 5: Update docs and commit**

Explicitly state that production remains disabled until a provider-specific adapter plan passes. Link canonical specs instead of duplicating them.

```bash
git add tests/e2e/deployment-rollback-control.spec.ts \
  docs/testing/2026-08-03-deployment-rollback-test-matrix.md \
  docs/architecture/DEVELOPMENT_CONTROL_PLANE.md docs/ARCHITECTURE.md \
  docs/DATA_MODEL.md docs/MCP.md SECURITY.md DEPLOYMENT.md RUNBOOK.md CHANGELOG.md
git commit -m "test: verify deployment and rollback control plane"
git push
```

## Production adapter follow-up gate

A real production adapter is a separate narrow implementation plan created only after the owner selects a host and its capabilities are observed. That plan must name exact provider APIs/files/credentials/limits, implement one static adapter, extend capability evidence/health/rollback tests and preserve every invariant in this plan. Installing a provider connector or finding deployment documentation is not itself host selection or authorization.

## Acceptance criteria

This plan is complete only when:

- merge is exact-head/gate/approval bound and never direct push;
- artifacts are immutable, content-addressed and exact-SHA built;
- adapter registry is static/typed and cannot execute caller commands;
- production is visibly disabled without a verified provider adapter;
- local preview deploy/health/rollback works in reviewed rootless isolation;
- adapter acceptance and health are separate states;
- migration/security/secret/unknown rollback effects escalate critical;
- data restore remains separate from artifact rollback;
- switches, idempotency, external reconciliation and history are tested;
- UI/MCP tools are specific and approval-driven;
- deployment boundary, secret, confidentiality and full workspace gates pass.
