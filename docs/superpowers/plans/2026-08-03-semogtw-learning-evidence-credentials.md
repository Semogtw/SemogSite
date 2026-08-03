# Semogtw Learning Evidence and Credentials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a private evidence proposal/review pipeline, deterministic source policies and credential management that can support GitHub and Gmail/Spark workflows without letting untrusted external text directly change canonical progress.

**Architecture:** Extend the Growth domain with candidates, explicit claims, reviews, source policies and credentials. External adapters produce bounded candidates; accepted claims update checkpoint values/states through existing audited Growth services. The first credential flow stores normalized metadata and optional private attachment references, not Gmail credentials or raw mailbox bodies.

**Tech Stack:** Node.js 22, TypeScript, Zod, SQLite/Drizzle, existing GET-only GitHub observations, TanStack Start/Router, React, Vitest, Playwright, pnpm workspaces.

## Global Constraints

- Depends on the completed and verified Learning Goals Core plan.
- Reconcile migration numbering first; the approved sequence assigns `0016_learning_evidence_credentials.sql` after `0015_learning_goals.sql`.
- Treat every commit message, PR body, README, email body and external-agent summary as untrusted data.
- External data creates candidates; it does not alter goal/checkpoint/skill state before accepted review or an exact deterministic policy.
- LLM classification, file extensions, keywords and email subjects can never qualify for deterministic auto-accept.
- Persist normalized allowlisted metadata only; never persist raw provider response bodies, email bodies, authorization headers or Gmail credentials.
- Reference GitHub evidence by exact normalized repository/branch/SHA/PR/workflow identifiers.
- Credential email import creates `pending_review`, never `verified`.
- Keep optional attachment bytes outside SQLite; persist only a private storage reference, SHA-256 and bounded metadata.
- Require owner authorization, CSRF, expected version, idempotency and audit for review/policy/credential mutations.
- All evidence and credentials remain private and absent from public DTOs/routes/build output.
- Commit and push every independently reviewable task.

---

## Planned file structure

```text
packages/domain/src/growth/
  evidence-model.ts
  evidence-validation.ts
  evidence-service.ts
  evidence-policy.ts
  credential-model.ts
  credential-service.ts
  *.test.ts

packages/database/
  migrations/0016_learning_evidence_credentials.sql
  src/schema/growth-evidence.ts
  src/repositories/learning-evidence-repository.ts
  src/repositories/learning-evidence-policy-repository.ts
  src/repositories/learning-credential-repository.ts
  src/repositories/growth-evidence-read-model.ts
  src/repositories/*.test.ts
  src/growth-evidence-migrations.test.ts

packages/github/src/
  growth-evidence.ts
  growth-evidence.test.ts

apps/web/src/
  routes/devos.growth.evidence.tsx
  routes/devos.growth.credentials.tsx
  routes/devos.growth.integrations.tsx
  components/devos/evidence-review-list.tsx
  components/devos/evidence-review-panel.tsx
  components/devos/evidence-policy-form.tsx
  components/devos/credential-form.tsx
  components/devos/credential-review-list.tsx
  components/devos/credential-detail.tsx
  server/devos-growth-evidence.ts
  server/devos-growth-evidence-mutations.ts
  server/devos-growth-credentials.ts
  server/devos-growth-credentials-mutations.ts

packages/storage/src/private-attachment-store.ts   # create only if no existing private file port exists

tests/e2e/growth-evidence-credentials.spec.ts
docs/testing/2026-08-03-learning-evidence-credentials-test-matrix.md
```

---

### Task 1: Reconcile the verified Growth core baseline

**Files:**
- Create: `docs/testing/2026-08-03-learning-evidence-credentials-test-matrix.md`
- Modify: `docs/superpowers/plans/README.md`
- Modify: `docs/DATA_MODEL.md`

- [ ] **Step 1: Verify required ancestry and migrations**

```bash
git fetch --all --prune
git rev-parse HEAD
rg "0015_learning_goals|learning_goals|deriveGoalProgress" packages docs
ls packages/database/migrations
```

Expected: the Learning Goals Core exists and its exact verified head is recorded. `0016` is unused or numbering is reconciled in all dependent docs before coding.

- [ ] **Step 2: Re-run the focused Growth gates**

```bash
pnpm --filter @semogtw/domain exec vitest run src/growth
pnpm --filter @semogtw/database exec vitest run src/growth-migrations.test.ts src/repositories/*learning*.test.ts src/repositories/skill-repository.test.ts src/repositories/growth-read-model.test.ts
pnpm --filter @semogtw/web exec vitest run src/server/devos-growth*.test.ts
pnpm check:public-confidentiality
```

Record exact observed results. Stop only for a real code dependency; document environmental blocks and continue documentation-resolvable work.

- [ ] **Step 3: Document planned evidence semantics**

Add a future-model section defining candidates, claims, reviews, policies and credentials. Do not claim tables/routes exist yet.

- [ ] **Step 4: Commit**

```bash
git add docs/testing/2026-08-03-learning-evidence-credentials-test-matrix.md docs/superpowers/plans/README.md docs/DATA_MODEL.md
git commit -m "docs: establish learning evidence baseline"
git push
```

---

### Task 2: Define evidence and credential contracts

**Files:**
- Create: `packages/domain/src/growth/evidence-model.ts`
- Create: `packages/domain/src/growth/evidence-validation.ts`
- Create: `packages/domain/src/growth/evidence-validation.test.ts`
- Create: `packages/domain/src/growth/credential-model.ts`
- Modify: `packages/domain/src/growth/index.ts`

**Interfaces:**

```ts
export type EvidenceSourceKind =
  | "manual"
  | "github_commit"
  | "github_pull_request"
  | "github_workflow"
  | "certificate"
  | "course"
  | "assessment"
  | "project"
  | "external_agent";

export type EvidenceCandidateStatus =
  | "proposed"
  | "accepted"
  | "rejected"
  | "superseded";

export type EvidenceClaimKind =
  | "checkpoint_progress"
  | "checkpoint_completion"
  | "skill_stage"
  | "goal_context";

export type EvidenceAcceptancePolicy =
  | "informational_only"
  | "owner_review_required"
  | "deterministic_auto_accept";

export type CredentialStatus =
  | "pending_review"
  | "verified"
  | "unverified"
  | "expired"
  | "revoked"
  | "rejected";

export function normalizeEvidenceSourceReference(input: {
  kind: EvidenceSourceKind;
  reference: string;
}): string;

export function validateEvidenceMetadata(input: unknown): Readonly<Record<string, unknown>>;
export function validateCredentialVerificationUrl(value: string | null): string | null;
```

Metadata allowlist keys by source:

```text
github_commit: repositoryId, branch, commitSha, changedPathCount, languageHints, observedAt
github_pull_request: repositoryId, pullNumber, headSha, mergedAt, changedPathCount
github_workflow: repositoryId, workflowName, runId, commitSha, conclusion, observedAt
certificate/course: issuer, title, issuedAt, expiresAt, credentialId, verificationUrl, hours
assessment: provider, assessmentId, score, maximumScore, observedAt
project/manual/external_agent: bounded sourceId, observedAt, neutral labels only
```

- [ ] **Step 1: Write failing validation tests**

Reject secret-shaped keys, unknown metadata keys, nested depth over 3, arrays over 50, non-HTTPS URLs, abbreviated/nonhex SHA, unsafe source references, raw email/provider body keys and strings over configured bounds.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/domain exec vitest run src/growth/evidence-validation.test.ts
```

- [ ] **Step 3: Implement strict pure validation**

Use discriminated source schemas. Return canonical sorted metadata objects for deterministic hashing.

- [ ] **Step 4: Run checks and commit**

```bash
pnpm --filter @semogtw/domain exec vitest run src/growth/evidence-validation.test.ts
pnpm --filter @semogtw/domain typecheck
pnpm check:boundaries
git add packages/domain/src/growth
git commit -m "feat: define learning evidence contracts"
git push
```

---

### Task 3: Implement evidence policy evaluation

**Files:**
- Create: `packages/domain/src/growth/evidence-policy.ts`
- Create: `packages/domain/src/growth/evidence-policy.test.ts`
- Modify: `packages/domain/src/growth/index.ts`

**Interfaces:**

```ts
export type EvidencePolicyRule = {
  id: string;
  goalId: string | null;
  checkpointId: string | null;
  sourceKind: EvidenceSourceKind;
  policy: EvidenceAcceptancePolicy;
  exactMatch: Readonly<Record<string, string | number | boolean>>;
  enabled: boolean;
  version: number;
};

export type EvidencePolicyDecision =
  | { kind: "informational"; ruleId: string | null }
  | { kind: "review_required"; ruleId: string | null; reasonCode: string }
  | { kind: "auto_accept"; ruleId: string; matchedFields: readonly string[] };

export function evaluateEvidencePolicy(input: {
  candidate: EvidenceCandidate;
  claim: EvidenceClaim;
  rules: readonly EvidencePolicyRule[];
  sourceFresh: boolean;
}): EvidencePolicyDecision;
```

- [ ] **Step 1: Write failing policy tests**

Assert:

- no rule defaults to owner review;
- `external_agent` can never auto-accept;
- commit-message/file-extension/keyword fields cannot appear in `exactMatch`;
- stale source cannot auto-accept;
- exact workflow run conclusion + exact accepted branch/SHA may auto-accept a configured claim;
- exact issuer + credential ID + HTTPS verification pattern may auto-accept only a credential verification claim;
- conflicting matching rules fall back to owner review.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/domain exec vitest run src/growth/evidence-policy.test.ts
```

- [ ] **Step 3: Implement closed-world rule evaluation**

Only source-specific allowlisted fields participate. Return stable reason codes; do not execute regex supplied by clients. If pattern matching is required for credential hosts, store normalized exact host/path-prefix values and use reviewed deterministic matching.

- [ ] **Step 4: Run checks and commit**

```bash
pnpm --filter @semogtw/domain exec vitest run src/growth/evidence-policy.test.ts
pnpm --filter @semogtw/domain typecheck
git add packages/domain/src/growth
git commit -m "feat: evaluate learning evidence policies"
git push
```

---

### Task 4: Implement evidence and credential services

**Files:**
- Create: `packages/domain/src/growth/evidence-ports.ts`
- Create: `packages/domain/src/growth/evidence-service.ts`
- Create: `packages/domain/src/growth/evidence-service.test.ts`
- Create: `packages/domain/src/growth/credential-service.ts`
- Create: `packages/domain/src/growth/credential-service.test.ts`
- Modify: `packages/domain/src/growth/index.ts`

**Interfaces:**

```ts
export interface LearningEvidenceRepository {
  propose(input: ProposeEvidenceCandidateRecord): EvidenceCandidateAggregate;
  getCandidate(id: string): EvidenceCandidateAggregate | null;
  accept(input: AcceptEvidenceCandidateRecord): EvidenceCandidateAggregate;
  reject(input: RejectEvidenceCandidateRecord): EvidenceCandidateAggregate;
  supersede(input: SupersedeEvidenceCandidateRecord): EvidenceCandidateAggregate;
}

export interface LearningEvidencePolicyRepository {
  listApplicable(input: { goalId: string; checkpointId: string | null; sourceKind: EvidenceSourceKind }): readonly EvidencePolicyRule[];
  create(input: CreateEvidencePolicyRecord): EvidencePolicyRule;
  update(input: UpdateEvidencePolicyRecord): EvidencePolicyRule;
  disable(input: DisableEvidencePolicyRecord): EvidencePolicyRule;
}

export interface LearningCredentialRepository {
  propose(input: ProposeCredentialRecord): LearningCredential;
  getById(id: string): LearningCredential | null;
  review(input: ReviewCredentialRecord): LearningCredential;
  revoke(input: RevokeCredentialRecord): LearningCredential;
  attach(input: AttachCredentialFileRecord): LearningCredential;
}
```

Evidence service commands:

```text
proposeCandidate
acceptCandidate
rejectCandidate
supersedeCandidate
evaluateAndApplyPolicy
```

Credential commands:

```text
proposeCredential
markVerified
markUnverified
rejectCredential
revokeCredential
attachCredentialFile
```

- [ ] **Step 1: Write failing lifecycle tests**

Cover candidate hash/idempotency, changed idempotency conflict, target/version binding, accepted claim applying checkpoint value/status through existing Growth service, rejected/superseded terminal guards, policy auto-accept and rollback when checkpoint/event/audit update fails.

Credential tests cover duplicate issuer/title/date/credential ID, pending-by-default, owner verification, derived expiry, explicit revocation precedence, HTTPS URL and attachment metadata bounds.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/domain exec vitest run src/growth/evidence-service.test.ts src/growth/credential-service.test.ts
```

- [ ] **Step 3: Implement orchestration services**

Candidate acceptance must validate current goal/checkpoint/skill versions before applying claims. LLM/external-agent source always enters owner review regardless of client-supplied confidence.

- [ ] **Step 4: Run checks and commit**

```bash
pnpm --filter @semogtw/domain exec vitest run src/growth/evidence-service.test.ts src/growth/credential-service.test.ts
pnpm --filter @semogtw/domain typecheck
pnpm check:boundaries
git add packages/domain/src/growth
git commit -m "feat: add learning evidence review services"
git push
```

---

### Task 5: Add migration `0016_learning_evidence_credentials.sql`

**Files:**
- Create: `packages/database/migrations/0016_learning_evidence_credentials.sql`
- Create: `packages/database/src/schema/growth-evidence.ts`
- Modify: `packages/database/src/schema/index.ts`
- Create: `packages/database/src/growth-evidence-migrations.test.ts`
- Modify: `packages/database/src/adapters/sqlite-migrations.test.ts`
- Modify: `packages/database/src/backup/sqlite-backup.test.ts`
- Modify: `packages/database/src/index.ts`

**Tables:**

```text
learning_evidence_candidates
learning_evidence_claims
learning_evidence_reviews
learning_evidence_policies
learning_credentials
learning_credential_events
```

Constraints:

- canonical statuses/source kinds/claim kinds/policies;
- unique candidate canonical hash and idempotency key;
- claims target existing goal/checkpoint/skill as required by kind;
- accepted/rejected/superseded candidates carry review metadata;
- deterministic policies contain only bounded canonical JSON;
- credential verification URLs are HTTPS or null;
- attachment references/hash are private metadata, not blobs;
- no raw body/token/header columns;
- reviews/events are append-only.

- [ ] **Step 1: Write failing migration tests**

Assert migration order through `0016`, apply-twice behavior, constraints/indexes, event immutability, referential integrity, credential duplicate indexes and absence of raw-provider/email/token columns.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/database exec vitest run src/growth-evidence-migrations.test.ts src/adapters/sqlite-migrations.test.ts
```

- [ ] **Step 3: Implement migration/schema**

Use additive SQL and validated canonical JSON text columns only where relational columns do not fit source-specific metadata.

- [ ] **Step 4: Extend backup tests**

Verify candidates, reviews, policies, credentials, events and optional attachment references survive restore. Do not require attachment bytes inside the SQLite backup.

- [ ] **Step 5: Run checks and commit**

```bash
pnpm --filter @semogtw/database exec vitest run \
  src/growth-evidence-migrations.test.ts \
  src/adapters/sqlite-migrations.test.ts \
  src/backup/sqlite-backup.test.ts
pnpm --filter @semogtw/database typecheck
git add packages/database
git commit -m "feat: add learning evidence schema"
git push
```

---

### Task 6: Implement transactional repositories and read model

**Files:**
- Create: `packages/database/src/repositories/learning-evidence-repository.ts`
- Create: `packages/database/src/repositories/learning-evidence-repository.test.ts`
- Create: `packages/database/src/repositories/learning-evidence-policy-repository.ts`
- Create: `packages/database/src/repositories/learning-evidence-policy-repository.test.ts`
- Create: `packages/database/src/repositories/learning-credential-repository.ts`
- Create: `packages/database/src/repositories/learning-credential-repository.test.ts`
- Create: `packages/database/src/repositories/growth-evidence-read-model.ts`
- Create: `packages/database/src/repositories/growth-evidence-read-model.test.ts`
- Modify: `packages/database/src/index.ts`

**Read interfaces:**

```ts
export interface GrowthEvidenceReadService {
  listCandidates(input: { statuses: readonly EvidenceCandidateStatus[]; goalId?: string; limit: number }): readonly EvidenceCandidateSummaryRead[];
  getCandidate(id: string): EvidenceCandidateDetailRead | null;
  listPolicies(input: { goalId?: string; includeDisabled: boolean; limit: number }): readonly EvidencePolicyRead[];
  listCredentials(input: { statuses: readonly CredentialStatus[]; limit: number }): readonly CredentialSummaryRead[];
  getCredential(id: string): CredentialDetailRead | null;
}
```

- [ ] **Step 1: Write failing repository tests**

Cover atomic candidate + claims + event/audit writes, review applying checkpoint mutation atomically, duplicate/idempotency behavior, stale target rejection, policy versioning, credential review/revocation/attachment events and sanitized explicit DTO mapping.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/database exec vitest run src/repositories/learning-evidence*.test.ts src/repositories/learning-credential*.test.ts src/repositories/growth-evidence-read-model.test.ts
```

- [ ] **Step 3: Implement repositories/read model**

Use `IMMEDIATE` transactions. Parse canonical metadata through domain schemas before returning. Fail closed on malformed rows.

- [ ] **Step 4: Run checks and commit**

```bash
pnpm --filter @semogtw/database exec vitest run src/repositories/learning-evidence*.test.ts src/repositories/learning-credential*.test.ts src/repositories/growth-evidence-read-model.test.ts
pnpm --filter @semogtw/database typecheck
git add packages/database/src/repositories packages/database/src/index.ts
git commit -m "feat: persist learning evidence and credentials"
git push
```

---

### Task 7: Map normalized GitHub observations into candidates

**Files:**
- Create: `packages/github/src/growth-evidence.ts`
- Create: `packages/github/src/growth-evidence.test.ts`
- Modify: `packages/github/src/index.ts`

**Interfaces:**

```ts
export type GitHubEvidenceSelection = {
  repositoryId: string;
  acceptedBranch: string;
  checkpointId: string;
  allowedPathPrefixes: readonly string[];
  allowedLanguageHints: readonly string[];
};

export function mapCommitObservationToEvidence(input: {
  selection: GitHubEvidenceSelection;
  observation: NormalizedGitHubBranchObservation;
}): ProposedEvidenceCandidate | null;

export function mapWorkflowObservationToEvidence(input: {
  selection: GitHubEvidenceSelection;
  observation: NormalizedGitHubWorkflowObservation;
}): ProposedEvidenceCandidate | null;
```

- [ ] **Step 1: Write failing mapping tests**

Assert exact accepted branch/full SHA, bounded path/language hints, stale observation marking, no commit-message/README/PR-body copying, no candidate for unrelated repository/branch and deterministic candidate hash inputs.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/github exec vitest run src/growth-evidence.test.ts
```

- [ ] **Step 3: Implement pure mapping**

This package produces candidate values only; it does not persist or accept evidence and adds no GitHub write method.

- [ ] **Step 4: Run checks and commit**

```bash
pnpm --filter @semogtw/github exec vitest run src/growth-evidence.test.ts
pnpm --filter @semogtw/github typecheck
pnpm check:boundaries
git add packages/github/src
git commit -m "feat: map GitHub observations to learning evidence"
git push
```

---

### Task 8: Add private attachment storage port

**Files:**
- Inspect first: existing packages for a private file/object storage port.
- Create only when absent: `packages/storage/package.json`
- Create only when absent: `packages/storage/src/private-attachment-store.ts`
- Create only when absent: `packages/storage/src/private-attachment-store.test.ts`
- Modify: workspace configuration only when a new package is required.

**Interfaces:**

```ts
export type PrivateAttachmentMetadata = {
  id: string;
  contentType: "application/pdf" | "image/png" | "image/jpeg";
  byteLength: number;
  sha256: string;
  createdAt: string;
};

export interface PrivateAttachmentStore {
  put(input: {
    stream: AsyncIterable<Uint8Array>;
    contentType: PrivateAttachmentMetadata["contentType"];
    maximumBytes: number;
  }): Promise<PrivateAttachmentMetadata>;
  delete(id: string): Promise<void>;
  stat(id: string): Promise<PrivateAttachmentMetadata | null>;
}
```

- [ ] **Step 1: Search before creating a package**

```bash
rg "AttachmentStore|ObjectStore|FileStore|blob storage|private file" packages apps docs
```

Reuse an existing suitable port. Do not create duplicate abstractions.

- [ ] **Step 2: Write failing contract tests**

Verify accepted content types, maximum size, streaming SHA-256, mismatch rejection, no overwrite and delete/stat behavior. The local test adapter uses a temporary ignored directory.

- [ ] **Step 3: Implement the minimal port and test adapter**

Do not choose production S3/R2/Supabase storage in this task. Host adapters remain deployment-specific.

- [ ] **Step 4: Run checks and commit**

```bash
pnpm --filter @semogtw/storage test
pnpm --filter @semogtw/storage typecheck
pnpm check:boundaries
git add packages pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "feat: define private credential attachment storage"
git push
```

Skip package creation only when a verified existing port satisfies the exact interface; record the reused path in the test matrix.

---

### Task 9: Add owner-only evidence and credential server functions

**Files:**
- Create: `apps/web/src/server/devos-growth-evidence.ts`
- Create: `apps/web/src/server/devos-growth-evidence.test.ts`
- Create: `apps/web/src/server/devos-growth-evidence-mutations.ts`
- Create: `apps/web/src/server/devos-growth-evidence-mutations.test.ts`
- Create: `apps/web/src/server/devos-growth-credentials.ts`
- Create: `apps/web/src/server/devos-growth-credentials.test.ts`
- Create: `apps/web/src/server/devos-growth-credentials-mutations.ts`
- Create: `apps/web/src/server/devos-growth-credentials-mutations.test.ts`

**Interfaces:**

```text
readEvidenceCandidates
readEvidenceCandidate
proposeManualEvidence
acceptEvidenceCandidate
rejectEvidenceCandidate
supersedeEvidenceCandidate
readEvidencePolicies
createEvidencePolicy
updateEvidencePolicy
disableEvidencePolicy
readCredentials
readCredential
proposeCredential
reviewCredential
revokeCredential
attachCredentialFile
```

- [ ] **Step 1: Write failing auth/mutation tests**

Assert owner resolution before database/storage access, CSRF, confirmation/reason for accept/reject/revoke/policy auto-accept, expected version, idempotency, upload size/type/hash and sanitized error codes.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/web exec vitest run src/server/devos-growth-evidence*.test.ts src/server/devos-growth-credentials*.test.ts
```

- [ ] **Step 3: Implement composition**

Never accept client-provided actor/audit IDs. Upload success is shown only after storage write and database metadata/event transaction complete; on database failure delete only the newly created attachment.

- [ ] **Step 4: Run checks and commit**

```bash
pnpm --filter @semogtw/web exec vitest run src/server/devos-growth-evidence*.test.ts src/server/devos-growth-credentials*.test.ts
pnpm --filter @semogtw/web typecheck
pnpm check:public-confidentiality
git add apps/web/src/server
git commit -m "feat: add learning evidence server controls"
git push
```

---

### Task 10: Build evidence, credential and integration UI

**Files:**
- Create: `apps/web/src/routes/devos.growth.evidence.tsx`
- Create: `apps/web/src/routes/devos.growth.credentials.tsx`
- Create: `apps/web/src/routes/devos.growth.integrations.tsx`
- Create: `apps/web/src/components/devos/evidence-review-list.tsx`
- Create: `apps/web/src/components/devos/evidence-review-panel.tsx`
- Create: `apps/web/src/components/devos/evidence-policy-form.tsx`
- Create: `apps/web/src/components/devos/credential-form.tsx`
- Create: `apps/web/src/components/devos/credential-review-list.tsx`
- Create: `apps/web/src/components/devos/credential-detail.tsx`
- Modify: `apps/web/src/styles/growth.css`
- Modify: Growth route navigation/components.

- [ ] **Step 1: Write failing route/component tests**

Cover pending counts, candidate source/freshness, exact claim targets, before/after progress preview, owner reasons, policy warnings, credential pending/verified/expired states, duplicate merge warning and attachment fallback.

- [ ] **Step 2: Implement review-first UX**

Default actions are `Aceitar evidência`, `Rejeitar`, `Selecionar destino` and `Revisar credencial`. Do not show an automatic “concluído” button from a proposal.

- [ ] **Step 3: Implement integrations page**

Explain current source state and delivery methods: manual, normalized GitHub observations, future Spark proposal and future host webhook/schedule. Do not claim Gmail/MCP automation is enabled before acceptance evidence exists.

- [ ] **Step 4: Run checks and commit**

```bash
pnpm --filter @semogtw/web test
pnpm --filter @semogtw/web typecheck
pnpm check:public-confidentiality
git add apps/web/src/routes apps/web/src/components apps/web/src/styles/growth.css
git commit -m "feat: add learning evidence review workspace"
git push
```

---

### Task 11: Add E2E, security review and final docs

**Files:**
- Create: `tests/e2e/growth-evidence-credentials.spec.ts`
- Create: `docs/security/2026-08-03-learning-evidence-threat-model.md`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `SECURITY.md`
- Modify: `DEPLOYMENT.md`
- Modify: `RUNBOOK.md`
- Modify: `docs/DATA_MODEL.md`
- Modify: `docs/TESTING.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/testing/2026-08-03-learning-evidence-credentials-test-matrix.md`

- [ ] **Step 1: Threat-model the feature**

Cover malicious commit/email/provider content, credential forgery, attachment malware, duplicate/replay, policy overbreadth, stale source, private-data leakage, audit/log leakage and compromised external client.

- [ ] **Step 2: Write E2E scenarios**

Verify:

1. anonymous routes redirect before private data;
2. manual proposal does not affect progress before acceptance;
3. acceptance previews and applies exact claim;
4. LLM/external-agent candidate cannot auto-accept;
5. deterministic exact policy can accept a synthetic trusted workflow fixture;
6. duplicate candidate/credential does not silently overwrite;
7. certificate email-shaped proposal remains pending/unverified;
8. attachment type/size failure is safe;
9. 360 px no overflow;
10. public output has no evidence/credential markers.

- [ ] **Step 3: Run focused gates**

```bash
pnpm check:boundaries
pnpm check:public-confidentiality
pnpm --filter @semogtw/domain exec vitest run src/growth
pnpm --filter @semogtw/database exec vitest run src/growth-evidence-migrations.test.ts src/repositories/learning-evidence*.test.ts src/repositories/learning-credential*.test.ts src/repositories/growth-evidence-read-model.test.ts
pnpm --filter @semogtw/github exec vitest run src/growth-evidence.test.ts
pnpm --filter @semogtw/web exec vitest run src/server/devos-growth-evidence*.test.ts src/server/devos-growth-credentials*.test.ts
pnpm --filter @semogtw/web build
node scripts/prepare-e2e.mjs
pnpm exec playwright test tests/e2e/growth-evidence-credentials.spec.ts
```

- [ ] **Step 4: Run full gates and reconcile docs**

```bash
pnpm check
pnpm build
pnpm test:e2e
```

Record observed results and exact head. Update migration/backup/storage/deployment limitations without claiming an unverified production attachment adapter.

- [ ] **Step 5: Commit**

```bash
git add tests/e2e/growth-evidence-credentials.spec.ts docs README.md ARCHITECTURE.md SECURITY.md DEPLOYMENT.md RUNBOOK.md CHANGELOG.md
git commit -m "docs: verify learning evidence and credentials"
git push
```

---

## Completion gate

This plan is complete only when untrusted inputs remain proposals, accepted claims are transactional/auditable, deterministic auto-accept is closed-world and excludes LLM-only classification, credentials preserve verification state and private attachment references, and all private/public/backup/browser gates pass on the exact head.
