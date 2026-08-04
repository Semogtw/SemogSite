# Semogtw Learning MCP Reads and Spark Workflows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose bounded read-only Growth projections through the authenticated Semogtw MCP endpoint and verify useful Gemini Spark workflows while preserving manual fallbacks and deferring all MCP writes to a separately approved post-gate design.

**Architecture:** Extend the provider-neutral Growth read-service boundary and `packages/mcp` with six strict read tools. Compose them through `apps/mcp` and the verified remote bridge. Spark combines SemogSite reads with its own GitHub/Gmail/Calendar access; before write authorization exists, it produces structured previews/reports for owner review rather than mutating canonical Growth state.

**Tech Stack:** TypeScript, Zod, SQLite read models, `@modelcontextprotocol/sdk` 1.x, authenticated stateless Streamable HTTP, OAuth `devos.read`, Vitest, generic MCP client harness and Gemini Spark acceptance when custom apps are available.

## Global Constraints

- Depends on verified Learning Goals Core and Learning Evidence/Credentials plans.
- Depends on verified remote MCP Phases A–E from `2026-08-03-semogtw-remote-mcp-spark.md`.
- Follow `docs/superpowers/specs/2026-08-03-semogtw-learning-growth-evidence-design.md`.
- Add reads only; initial OAuth scope remains exactly `devos.read`.
- Do not add or request a write scope in this plan.
- Do not add direct progress percentage, completion, evidence acceptance, credential verification or checkpoint waiver tools.
- Do not send Google/Gmail/GitHub credentials to SemogSite.
- Treat external/provider text as untrusted data and avoid returning it verbatim in generated instructions.
- Keep collections at most 50 entries and preserve the existing 256 KiB logical MCP response limit.
- Keep `packages/mcp` transport/auth/database-free and `apps/mcp` listener-free.
- Spark custom-app unavailability is `external_dependency`, not code failure.
- Commit and push every independently reviewable task.

---

## Read tool catalog

```text
devos_list_learning_goals             structured key: learningGoals
devos_get_learning_goal               structured key: learningGoal
devos_list_due_learning_checkpoints   structured key: dueCheckpoints
devos_get_skill_profile               structured key: skillProfile
devos_list_learning_evidence          structured key: learningEvidence
devos_list_credentials                structured key: credentials
```

No new MCP resources are required in the first slice.

---

### Task 1: Verify all dependency gates and exact endpoint state

**Files:**
- Create: `docs/testing/2026-08-03-learning-mcp-spark-test-matrix.md`
- Modify: `docs/superpowers/plans/README.md`

- [ ] **Step 1: Verify ancestry and implemented dependencies**

```bash
git fetch --all --prune
git rev-parse HEAD
rg "learning_goals|learning_evidence_candidates|learning_credentials" packages/database/migrations packages/database/src
rg "apps/mcp-http|SEMOGTW_MCP_REMOTE_ENABLED|devos.read" apps packages docs/testing
```

Expected: migrations/services/read models for Growth exist and remote read-only OAuth/Streamable HTTP has observed test evidence. If not, mark this plan blocked by exact dependency and do not implement the catalog prematurely.

- [ ] **Step 2: Run dependency gates**

```bash
pnpm --filter @semogtw/domain exec vitest run src/growth
pnpm --filter @semogtw/database exec vitest run src/repositories/growth-read-model.test.ts src/repositories/growth-evidence-read-model.test.ts
pnpm --filter @semogtw/mcp test
pnpm --filter @semogtw/mcp-app test
pnpm --filter @semogtw/mcp-http test
pnpm check:mcp-transport-boundary
pnpm check:mcp-package-boundaries
pnpm check:mcp-node-runtime-boundary
```

Record exact observed results, endpoint origin placeholder policy and installed SDK version.

- [ ] **Step 3: Commit baseline matrix**

```bash
git add docs/testing/2026-08-03-learning-mcp-spark-test-matrix.md docs/superpowers/plans/README.md
git commit -m "docs: establish learning MCP baseline"
git push
```

---

### Task 2: Define strict provider-neutral Growth MCP read DTOs

**Files:**
- Create: `packages/domain/src/growth/mcp-growth-read.ts`
- Create: `packages/domain/src/growth/mcp-growth-read.test.ts`
- Modify: `packages/domain/src/growth/index.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**

```ts
export type LearningGoalMcpRead = {
  id: string;
  slug: string;
  title: string;
  status: LearningGoalStatus;
  priority: "low" | "medium" | "high" | "critical";
  targetDate: string | null;
  derivedProgressPercent: number;
  nextCheckpoint: LearningCheckpointMcpRead | null;
  linkedSkillSlugs: readonly string[];
  pendingEvidenceCount: number;
};

export type LearningGoalDetailMcpRead = LearningGoalMcpRead & {
  description: string;
  motivation: string | null;
  checkpoints: readonly LearningCheckpointMcpRead[];
  progressExplanation: readonly CheckpointProgressExplanationRead[];
};

export type SkillProfileMcpRead = {
  skill: { id: string; slug: string; name: string };
  stage: SkillStage | null;
  acceptedEvidenceCount: number;
  activeGoalIds: readonly string[];
  evidenceBasis: readonly { candidateId: string; sourceKind: EvidenceSourceKind; observedAt: string }[];
};

export type LearningEvidenceMcpRead = {
  id: string;
  sourceKind: EvidenceSourceKind;
  status: EvidenceCandidateStatus;
  observedAt: string;
  title: string;
  targetGoalId: string | null;
  targetCheckpointId: string | null;
  sourceFreshness: "fresh" | "stale" | "unknown";
};

export type CredentialMcpRead = {
  id: string;
  title: string;
  issuer: string;
  issuedAt: string | null;
  expiresAt: string | null;
  status: CredentialStatus;
  hours: number | null;
  hasAttachment: boolean;
};

export interface DevOSGrowthMcpReadService {
  listLearningGoals(input: { statuses: readonly LearningGoalStatus[]; limit: number }): Promise<readonly LearningGoalMcpRead[]>;
  getLearningGoal(input: { id?: string; slug?: string }): Promise<LearningGoalDetailMcpRead | null>;
  listDueLearningCheckpoints(input: { before?: string; goalId?: string; limit: number }): Promise<readonly LearningCheckpointMcpRead[]>;
  getSkillProfile(input: { slug: string }): Promise<SkillProfileMcpRead | null>;
  listLearningEvidence(input: { statuses: readonly EvidenceCandidateStatus[]; goalId?: string; limit: number }): Promise<readonly LearningEvidenceMcpRead[]>;
  listCredentials(input: { statuses: readonly CredentialStatus[]; expiresBefore?: string; limit: number }): Promise<readonly CredentialMcpRead[]>;
}
```

- [ ] **Step 1: Write failing normalization/semantic tests**

Cover limit default `20`, max `50`, status dedup/sort, id-or-slug exclusive input, canonical skill slug, ISO date validation, no raw motivation in list view, no attachment reference/credential ID/verification URL in default list projection and progress derived from checkpoint explanation.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/domain exec vitest run src/growth/mcp-growth-read.test.ts
```

- [ ] **Step 3: Implement pure DTO/input contracts**

Reuse canonical enums/progress helpers. Keep the module provider/MCP-SDK/database-free.

- [ ] **Step 4: Run checks and commit**

```bash
pnpm --filter @semogtw/domain exec vitest run src/growth/mcp-growth-read.test.ts
pnpm --filter @semogtw/domain typecheck
pnpm check:boundaries
git add packages/domain/src/growth packages/domain/src/index.ts
git commit -m "feat: define growth MCP read contracts"
git push
```

---

### Task 3: Compose SQLite Growth MCP reads

**Files:**
- Create: `packages/database/src/repositories/mcp-growth-read-model.ts`
- Create: `packages/database/src/repositories/mcp-growth-read-model.test.ts`
- Modify: `packages/database/src/index.ts`

**Interfaces:**

```ts
export function createSqliteDevOSGrowthMcpReadService(
  database: SqliteDatabase,
  options?: { now?: () => string },
): DevOSGrowthMcpReadService;
```

- [ ] **Step 1: Write failing fixture tests**

Cover active/paused/completed goals, mixed progress, due checkpoints, alias-resolved skill profile, accepted versus pending evidence, stale source, credential states/expiry and malformed row fail-closed behavior.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/database exec vitest run src/repositories/mcp-growth-read-model.test.ts
```

- [ ] **Step 3: Implement explicit mappings**

Compose existing Growth read services. Do not duplicate progress, policy or expiry rules. Exclude attachment refs, raw metadata, audit/internal IDs and external message references from MCP DTOs unless explicitly allowlisted.

- [ ] **Step 4: Run checks and commit**

```bash
pnpm --filter @semogtw/database exec vitest run src/repositories/mcp-growth-read-model.test.ts src/repositories/growth-read-model.test.ts src/repositories/growth-evidence-read-model.test.ts
pnpm --filter @semogtw/database typecheck
git add packages/database/src/repositories/mcp-growth-read-model* packages/database/src/index.ts
git commit -m "feat: compose growth MCP reads"
git push
```

---

### Task 4: Add strict MCP output schemas and catalog metadata

**Files:**
- Create: `packages/mcp/src/growth-output-schemas.ts`
- Create: `packages/mcp/src/growth-output-schemas.test.ts`
- Modify: `packages/mcp/src/catalog.ts`
- Modify: `packages/mcp/src/catalog.test.ts`
- Modify: `packages/mcp/src/index.ts`

- [ ] **Step 1: Write failing schema tests**

Reject extra fields, more than 50 entries, invalid statuses/stages/dates/percent, duplicate or unsorted canonical arrays, raw `credentialId`, `verificationUrl`, `attachmentRef`, email/message/body/token/header fields and credential-shaped secret content.

- [ ] **Step 2: Write failing exact-catalog tests**

Assert exactly six new tools, no new resources, no mutation/proposal names and existing read annotations:

```json
{
  "readOnlyHint": true,
  "destructiveHint": false,
  "idempotentHint": true,
  "openWorldHint": false
}
```

- [ ] **Step 3: Run and verify failure**

```bash
pnpm --filter @semogtw/mcp exec vitest run src/growth-output-schemas.test.ts src/catalog.test.ts
```

- [ ] **Step 4: Implement strict schemas/catalog**

Use provider-neutral descriptions. Do not claim the system knows whether the owner studied; describe only persisted goals, accepted evidence and source freshness.

- [ ] **Step 5: Run checks and commit**

```bash
pnpm --filter @semogtw/mcp exec vitest run src/growth-output-schemas.test.ts src/catalog.test.ts
pnpm --filter @semogtw/mcp typecheck
git add packages/mcp/src
git commit -m "feat: define growth MCP read catalog"
git push
```

---

### Task 5: Register six MCP handlers

**Files:**
- Modify: `packages/mcp/src/server.ts`
- Modify: `packages/mcp/src/server.test.ts`
- Modify: `packages/mcp/src/server-output-bounds.test.ts`
- Modify: `packages/mcp/src/server-sensitive-output.test.ts`
- Modify: `packages/mcp/src/server-output-validation.test.ts`

**Inputs:**

```text
devos_list_learning_goals: { statuses?: LearningGoalStatus[]; limit?: number }
devos_get_learning_goal: { id?: string; slug?: string }
devos_list_due_learning_checkpoints: { before?: ISO timestamp; goalId?: string; limit?: number }
devos_get_skill_profile: { slug: string }
devos_list_learning_evidence: { statuses?: EvidenceCandidateStatus[]; goalId?: string; limit?: number }
devos_list_credentials: { statuses?: CredentialStatus[]; expiresBefore?: ISO timestamp; limit?: number }
```

Stable errors:

```text
GROWTH_INVALID_INPUT
LEARNING_GOAL_NOT_FOUND
SKILL_NOT_FOUND
```

Unexpected failures remain `DEVOS_READ_FAILED`.

- [ ] **Step 1: Write failing discovery/call tests**

Call every tool with valid and invalid inputs. Assert text/structured parity, exact structured keys, stable not-found errors, sensitive-output rejection and unchanged original catalog behavior.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/mcp exec vitest run src/server.test.ts src/server-output-bounds.test.ts src/server-sensitive-output.test.ts src/server-output-validation.test.ts
```

- [ ] **Step 3: Implement handlers**

Extend `SemogtwMcpReadService` with `DevOSGrowthMcpReadService`. Guard all handlers through existing output validation/serialization limits.

- [ ] **Step 4: Run checks and commit**

```bash
pnpm --filter @semogtw/mcp test
pnpm --filter @semogtw/mcp typecheck
pnpm check:mcp-package-boundaries
pnpm check:mcp-node-runtime-boundary
git add packages/mcp/src
git commit -m "feat: add growth MCP read tools"
git push
```

---

### Task 6: Compose reads in `apps/mcp` and remote HTTP

**Files:**
- Modify: `apps/mcp/src/sqlite-server.ts`
- Modify: `apps/mcp/src/sqlite-server.test.ts`
- Modify: remote bridge composition tests under `apps/mcp-http`.

- [ ] **Step 1: Write failing SQLite protocol tests**

Use a migrated fixture with goals/checkpoints/evidence/credentials and call all six tools through the official in-memory client/transport.

- [ ] **Step 2: Implement service composition**

Combine existing DevOS reads, workflow reads and Growth reads into one provider-neutral service passed to `createSemogtwMcpServer`.

- [ ] **Step 3: Verify authenticated HTTP**

Test valid `devos.read`, missing/expired/revoked/wrong-resource/insufficient-scope behavior. Ensure auth occurs before Growth database reads and no new scope is introduced.

- [ ] **Step 4: Run checks and commit**

```bash
pnpm --filter @semogtw/mcp-app test
pnpm --filter @semogtw/mcp-app typecheck
pnpm --filter @semogtw/mcp-http test
pnpm check:mcp-transport-boundary
git add apps/mcp apps/mcp-http
git commit -m "feat: expose growth reads over authenticated MCP"
git push
```

---

### Task 7: Verify generic client workflows

**Files:**
- Create: `docs/testing/2026-08-03-learning-mcp-generic-client-acceptance.md`
- Add integration fixtures/tests under `apps/mcp-http` as needed.

- [ ] **Step 1: Deploy or start a private preview**

Use the remote MCP runbook. Verify TLS/canonical origin/kill switch and use synthetic private fixture data, not production secrets.

- [ ] **Step 2: Test discovery and every tool**

Record client/version, OAuth flow, list tools, six calls, size/error behavior and revocation. Verify no write/proposal tool appears.

- [ ] **Step 3: Test useful read-only prompts**

Use prompts equivalent to:

```text
Resuma minhas metas ativas, explique a base do progresso e indique o próximo checkpoint.
Liste evidências pendentes sem afirmar que foram aceitas.
Quais credenciais expiram nos próximos 90 dias?
Quais habilidades possuem evidência aceita e quais ainda estão apenas em prática?
```

Expected: source-grounded summaries with no invented learning/completion claim.

- [ ] **Step 4: Commit evidence**

```bash
git add docs/testing/2026-08-03-learning-mcp-generic-client-acceptance.md apps/mcp-http
git commit -m "test: verify growth MCP client workflows"
git push
```

---

### Task 8: Define and test Spark read-only recipes

**Files:**
- Create: `docs/integrations/GEMINI_SPARK_GROWTH_WORKFLOWS.md`
- Create: `docs/testing/2026-08-03-gemini-spark-growth-acceptance.md`

**Recipes:**

#### Growth briefing

```text
Use o app Semogtw DevOS para ler metas, checkpoints, evidências e credenciais. Combine com meus apps Google somente do lado do Spark. Resuma o que exige atenção e não altere o DevOS.
```

#### Weekly GitHub evidence report

```text
Leia metas/checkpoints no Semogtw DevOS. Consulte o GitHub em modo somente leitura e produza uma tabela de possíveis evidências com repositório, branch, SHA/PR/workflow e checkpoint sugerido. Não marque progresso e não trate arquivo/commit como prova de aprendizado.
```

#### Gmail credential preview

```text
Quando um e-mail parecer conter certificado, extraia título, emissor, datas, carga horária, ID e URL de verificação. Mostre uma prévia estruturada para inserção manual no DevOS; não afirme que foi verificado.
```

#### Inactivity review

```text
Identifique metas sem evidência aceita recente e diga "sem evidência recente". Não conclua que não houve estudo.
```

- [ ] **Step 1: Verify account entitlement**

Check Gemini web for custom apps. Record available/unavailable, account region/plan context and date without exposing personal tokens.

- [ ] **Step 2: Connect private preview when available**

Complete OAuth and verify mobile visibility after web setup when supported. If unavailable, mark `external_dependency` and run recipes with the generic client/manual data instead.

- [ ] **Step 3: Run each recipe**

Verify tool selection, grounding, no mutation, no excessive data sharing and manual fallback. Record prompt/result summaries without private payloads.

- [ ] **Step 4: Remove/revoke and verify failure**

Remove the app/revoke client tokens; later calls must fail before private reads.

- [ ] **Step 5: Commit docs/evidence**

```bash
git add docs/integrations/GEMINI_SPARK_GROWTH_WORKFLOWS.md docs/testing/2026-08-03-gemini-spark-growth-acceptance.md
git commit -m "docs: verify Spark growth read workflows"
git push
```

---

### Task 9: Produce the supervised-write readiness package

**Files:**
- Create: `docs/integrations/GROWTH_MCP_WRITE_READINESS.md`
- Modify: `docs/superpowers/specs/2026-08-03-semogtw-learning-growth-evidence-design.md` only if observed client behavior changes an architectural decision.

This task does not add code or authorize writes.

- [ ] **Step 1: Record prerequisite evidence**

Require exact links/heads showing:

- remote OAuth/DCR/preregistration and stateless MCP verified;
- workflow and Growth read catalogs verified;
- token revocation/kill switch/rollback rehearsed;
- generic client and Spark/manual fallback behavior observed;
- canonical browser Growth mutations and evidence reviews verified;
- external write confirmation semantics documented for the target client.

- [ ] **Step 2: Record reserved future operations**

```text
devos_create_learning_goal
devos_add_learning_checkpoint
devos_link_goal_repository
devos_propose_learning_evidence
devos_propose_goal_progress
devos_propose_credential
```

Required future safety invariants:

- creation writes use dedicated scope and explicit owner/client consent;
- evidence/progress/credential imports create proposals by default;
- no direct percentage, completion, acceptance, verification or waiver operation;
- expected version/idempotency/audit on every write;
- client write confirmation is additional protection, not server authorization;
- a separate approved spec and implementation plan are mandatory.

- [ ] **Step 3: Record unresolved external questions as gates, not placeholders**

For each target client, record observed answers to:

```text
Does the client support custom write tools?
How is confirmation presented for scheduled/background tasks?
Can a scheduled run pause for confirmation?
What payload/file limits apply?
Can a Gmail trigger pass only normalized extracted fields?
```

Unknown answers are explicit `external_dependency` blockers for that client, not ambiguous implementation requirements.

- [ ] **Step 4: Commit readiness package**

```bash
git add docs/integrations/GROWTH_MCP_WRITE_READINESS.md docs/superpowers/specs/2026-08-03-semogtw-learning-growth-evidence-design.md
git commit -m "docs: define growth MCP write readiness gate"
git push
```

---

### Task 10: Run full gates and reconcile canonical docs

**Files:**
- Modify: `MCP.md`
- Modify: `README.md`
- Modify: `ARCHITECTURE.md`
- Modify: `SECURITY.md`
- Modify: `DEPLOYMENT.md`
- Modify: `RUNBOOK.md`
- Modify: `docs/TESTING.md`
- Modify: `CHANGELOG.md`
- Modify: `docs/testing/2026-08-03-learning-mcp-spark-test-matrix.md`

- [ ] **Step 1: Run focused gates**

```bash
pnpm --filter @semogtw/domain exec vitest run src/growth/mcp-growth-read.test.ts
pnpm --filter @semogtw/database exec vitest run src/repositories/mcp-growth-read-model.test.ts
pnpm --filter @semogtw/mcp test
pnpm --filter @semogtw/mcp-app test
pnpm --filter @semogtw/mcp-http test
pnpm check:mcp-transport-boundary
pnpm check:mcp-package-boundaries
pnpm check:mcp-node-runtime-boundary
```

- [ ] **Step 2: Run repository gates**

```bash
pnpm check
pnpm build
pnpm test:e2e
```

- [ ] **Step 3: Reconcile documentation**

Document exactly six Growth read tools, observed endpoint/client evidence and the explicit absence of write/proposal tools. Do not promote the readiness package into an approved write design.

- [ ] **Step 4: Commit**

```bash
git add MCP.md README.md ARCHITECTURE.md SECURITY.md DEPLOYMENT.md RUNBOOK.md docs CHANGELOG.md
git commit -m "docs: verify learning MCP and Spark reads"
git push
```

---

## Completion gate

This plan is complete only when six Growth tools are discoverable through the authenticated read-only endpoint, strict/sanitized/size-bounded, generic client acceptance passes, Spark acceptance is observed or explicitly blocked externally, revocation works, and no write scope/tool or canonical mutation was introduced.
