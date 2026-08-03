# Semogtw Agent Write Authorization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Authorize authenticated AI/MCP clients through explicit capabilities, resource filters, risk ceilings, temporary trust, confirmation challenges and independent write kill switches without enabling unrestricted mutation or self-escalation.

**Architecture:** Extend `@semogtw/application` with a provider-neutral policy engine and persistence ports. Migration `0018` binds grants to the OAuth clients created by migration `0014`, stores capabilities/resource selectors and bounded trust sessions, and stores only digests for confirmation challenges. MCP discovery is filtered by effective authorization; concrete domain write tools remain separate rollout work.

**Tech Stack:** Node.js 22, TypeScript strict mode, Zod, Vitest, SQLite/Drizzle, existing `@semogtw/application`, planned `@semogtw/mcp-auth`, `@modelcontextprotocol/sdk`, TanStack Start/Router, Playwright.

## Global Constraints

- Implement only after the Command Gateway plan passes on the exact head.
- Remote-client acceptance requires the authenticated remote MCP read endpoint and its OAuth/PKCE/revocation/isolation gates to pass first.
- Reconcile migration numbering; this plan reserves `0018_agent_authorization.sql` after `0017_command_core.sql`.
- Default deny applies when any OAuth scope, client status, capability, resource selector, risk ceiling, trust session or kill switch is missing/negative.
- OAuth scope is necessary but never sufficient; effective permission is the intersection of all policy layers.
- Clients cannot grant, extend or weaken controls governing themselves.
- Provider/model names are bounded audit metadata and never authorization proof.
- Resource selection uses canonical IDs and reviewed selector types; display names and caller-supplied regex never broaden access.
- Critical risk is never allowed by temporary trust or client confirmation.
- Remote writes are globally disabled by default after migration.
- Read access remains independently available when write switches are disabled.
- Confirmation challenges are short-lived, one-use and bound to client, command, payload hash, resource snapshot and risk.
- No raw confirmation response, bearer token, client secret, command payload or private content is persisted/logged.
- This plan adds no generic `devos_execute_command`, raw SQL, shell, filesystem or HTTP proxy tool.
- Concrete domain writes require separate command-by-command rollout and editability-manifest coverage.
- Commit and push after each independently reviewable task.

---

## Planned file structure

```text
packages/application/src/authorization/
  types.ts
  capabilities.ts
  capabilities.test.ts
  resource-selectors.ts
  resource-selectors.test.ts
  effective-grant.ts
  effective-grant.test.ts
  policy-engine.ts
  policy-engine.test.ts
  trust-session.ts
  trust-session.test.ts
  confirmation-challenge.ts
  confirmation-challenge.test.ts

packages/database/
  migrations/0018_agent_authorization.sql
  src/schema/agent-authorization.ts
  src/repositories/agent-profile-repository.ts
  src/repositories/agent-profile-repository.test.ts
  src/repositories/agent-grant-repository.ts
  src/repositories/agent-grant-repository.test.ts
  src/repositories/agent-trust-session-repository.ts
  src/repositories/agent-trust-session-repository.test.ts
  src/repositories/agent-write-switch-repository.ts
  src/repositories/agent-write-switch-repository.test.ts
  src/repositories/confirmation-challenge-repository.ts
  src/repositories/confirmation-challenge-repository.test.ts
  src/composition/agent-command-policy.ts
  src/composition/agent-command-policy.test.ts

packages/mcp-auth/src/
  scopes.ts
  scopes.test.ts

packages/mcp/src/
  authorization-discovery.ts
  authorization-discovery.test.ts

apps/web/src/server/
  devos-agent-management.ts
  devos-agent-management.test.ts
  devos-agent-trust.ts
  devos-agent-trust.test.ts
  devos-remote-write-switches.ts
  devos-remote-write-switches.test.ts

apps/web/src/routes/
  devos.integrations.agents.tsx
  devos.integrations.agents.index.tsx
  devos.integrations.agents.$clientId.tsx
  devos.security.remote-access.tsx

apps/web/src/components/devos/
  agent-profile-form.tsx
  agent-grant-editor.tsx
  agent-resource-scope-editor.tsx
  agent-trust-session-form.tsx
  remote-write-switches.tsx

apps/web/src/styles/
  agent-integrations.css

tests/e2e/
  agent-write-authorization.spec.ts

docs/testing/
  2026-08-03-agent-write-authorization-test-matrix.md
```

---

### Task 1: Reconcile hard gates and authorization inventory

**Files:**
- Create: `docs/testing/2026-08-03-agent-write-authorization-test-matrix.md`
- Modify: `docs/architecture/EDITABILITY_COVERAGE.md`
- Modify: `docs/superpowers/plans/2026-08-03-semogtw-agent-editability-plan-stack.md`

**Interfaces:**
- Consumes: observed Command Gateway tests, migration `0014` table names, remote MCP acceptance evidence and command capability catalog.
- Produces: exact base SHA, confirmed schema references and a gate decision of `ready`, `blocked_external`, or `blocked_internal`.

- [ ] **Step 1: Inspect prerequisites**

```bash
git fetch --all --prune
git status --short --branch
git rev-parse HEAD
ls packages/database/migrations | sort
rg -n "mcp_oauth_clients|command_receipts|CommandGateway|EditabilityManifest" packages apps docs
rg -n "Spark compatibility|generic client|revocation|rollback" docs/testing docs/verification docs/handoffs
```

Expected: the test matrix records the exact evidence available. Missing remote read acceptance blocks external enablement but does not block pure policy/domain implementation.

- [ ] **Step 2: Verify migration reservation**

```bash
rg -n "0018_agent_authorization|0018_" packages/database/migrations docs/superpowers
```

Expected: `0018` is unused or all unimplemented plans are renumbered together before code.

- [ ] **Step 3: Inventory capabilities from registered commands**

Generate a table containing:

```text
command ID
capability
resource kind
risk floor
current UI parity
MCP discovery state
write rollout gate
```

No command may enter discovery if its capability/resource behavior is unclassified.

- [ ] **Step 4: Run prerequisite gates**

```bash
pnpm check:editability-coverage
pnpm --filter @semogtw/application test
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/mcp-auth test
pnpm --filter @semogtw/mcp test
```

Expected: exact results are recorded. If `@semogtw/mcp-auth` is not implemented yet, classify external enablement as blocked and continue only Tasks 2–6 with test doubles.

- [ ] **Step 5: Commit**

```bash
git add docs/testing/2026-08-03-agent-write-authorization-test-matrix.md \
  docs/architecture/EDITABILITY_COVERAGE.md \
  docs/superpowers/plans/2026-08-03-semogtw-agent-editability-plan-stack.md
git commit -m "docs: establish agent authorization gates"
git push
```

---

### Task 2: Define canonical capabilities and reviewed resource selectors

**Files:**
- Create: `packages/application/src/authorization/types.ts`
- Create: `packages/application/src/authorization/capabilities.ts`
- Create: `packages/application/src/authorization/capabilities.test.ts`
- Create: `packages/application/src/authorization/resource-selectors.ts`
- Create: `packages/application/src/authorization/resource-selectors.test.ts`
- Modify: `packages/application/src/index.ts`

**Interfaces:**

```ts
export type AgentCapability =
  | "attention.write"
  | "projects.write"
  | "roadmap.write"
  | "workflow.write"
  | "growth.write"
  | "growth.review"
  | "editorial.write"
  | "editorial.publish"
  | "appearance.write"
  | "integrations.request"
  | "development.request";

export type ResourceSelector =
  | { kind: "all" }
  | { kind: "exact_ids"; ids: readonly string[] }
  | { kind: "canonical_prefixes"; prefixes: readonly string[] }
  | { kind: "lifecycle_states"; states: readonly string[] };

export type AgentGrantDefinition = {
  id: string;
  ownerId: string;
  clientId: string;
  profileId: string | null;
  status: "active" | "suspended" | "revoked" | "expired";
  capabilities: readonly AgentCapability[];
  resourceSelectors: Readonly<Record<string, readonly ResourceSelector[]>>;
  riskCeiling: "low" | "medium" | "high";
  expiresAt: string | null;
  version: number;
};

export function capabilityForCommand(commandCapability: string): AgentCapability;
export function selectorMatchesResource(input: {
  selector: ResourceSelector;
  resource: CommandResource;
}): boolean;
export function validateResourceSelectorForKind(input: {
  resourceKind: string;
  selector: ResourceSelector;
}): void;
```

Selector restrictions:

- `all` is allowed only when the owner explicitly selects it in DevOS;
- `exact_ids` contains `1..200` canonical IDs, each `1..200` chars;
- `canonical_prefixes` contains `1..50` normalized prefixes, no `*`, regex, `..`, URL credentials or backslashes;
- `lifecycle_states` is allowed only for registered lifecycle-aware resource kinds and values from their allowlist;
- multiple selectors for one resource kind are OR; different policy layers remain AND;
- absent resource kind never implies all.

- [ ] **Step 1: Write failing capability tests**

Assert every registered command capability maps to a known `AgentCapability`, unknown capabilities fail closed and no administrative capability can be inferred from `development.request`.

- [ ] **Step 2: Write failing selector tests**

```ts
expect(
  selectorMatchesResource({
    selector: { kind: "exact_ids", ids: ["project_semogsite"] },
    resource: {
      kind: "project",
      id: "project_semogsite",
      parentRefs: [],
    },
  }),
).toBe(true);

expect(() =>
  validateResourceSelectorForKind({
    resourceKind: "repository_path",
    selector: { kind: "canonical_prefixes", prefixes: ["../secrets"] },
  }),
).toThrow("INVALID_CANONICAL_PREFIX");
```

- [ ] **Step 3: Run and verify failure**

```bash
pnpm --filter @semogtw/application exec vitest run src/authorization/capabilities.test.ts src/authorization/resource-selectors.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement pure bounded logic**

Do not import OAuth, database, MCP SDK or provider packages.

- [ ] **Step 5: Run and commit**

```bash
pnpm --filter @semogtw/application exec vitest run src/authorization/capabilities.test.ts src/authorization/resource-selectors.test.ts
pnpm --filter @semogtw/application typecheck
git add packages/application/src
git commit -m "feat: define agent capabilities and resource scopes"
git push
```

---

### Task 3: Add migration 0018 and authorization persistence

**Files:**
- Create: `packages/database/migrations/0018_agent_authorization.sql`
- Create: `packages/database/src/schema/agent-authorization.ts`
- Modify: `packages/database/src/schema/index.ts`
- Modify: `packages/database/src/index.ts`
- Create: migration tests following the repository convention.
- Modify: backup/restore tests.

**Tables:**

```text
agent_profiles
agent_grants
agent_grant_capabilities
agent_grant_resource_selectors
agent_trust_sessions
agent_trust_session_capabilities
agent_trust_session_resources
agent_write_switches
agent_confirmation_challenges
agent_authorization_events
```

Key schema requirements:

```sql
-- illustrative required relationships, not a replacement for the full migration
agent_grants.client_id
  REFERENCES mcp_oauth_clients(id)
  ON DELETE RESTRICT;

UNIQUE(agent_grants.owner_id, agent_grants.client_id, agent_grants.id);
UNIQUE(agent_grant_capabilities.grant_id, agent_grant_capabilities.capability);
UNIQUE(agent_write_switches.owner_id, agent_write_switches.scope_kind, agent_write_switches.scope_ref);
```

Statuses/checks:

```text
profile built_in_key: read_only | personal_assistant | project_agent | editorial_agent | growth_agent | development_agent | supervised_admin | custom
risk ceiling: low | medium | high
trust risk ceiling: low | medium only
switch scope: global | client | domain
challenge status: pending | consumed | expired | revoked
```

Confirmation challenge storage:

```text
challenge_id
client_id
command_id/version
payload_sha256
resource_snapshot_sha256
risk
nonce_digest
expires_at
consumed_at
revoked_at
```

There is no raw nonce/response/payload column.

Initial migration seed:

- built-in profile definitions only;
- global remote-write switch set to disabled;
- no client grant;
- no trust session.

- [ ] **Step 1: Write failing migration tests**

Assert foreign keys to `mcp_oauth_clients`, unique constraints, status/risk checks, digest-only challenge fields, built-in seed idempotency, global write disabled and no default grant.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/database exec vitest run src/agent-authorization-migrations.test.ts src/adapters/sqlite-migrations.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement migration/schema**

Use integer optimistic versions and UTC ISO timestamps. Resource selector JSON is bounded/canonicalized before persistence; the table stores selector type and canonical JSON separately.

- [ ] **Step 4: Extend backup tests**

Prove restore preserves profiles/grants/switches/challenge digests without requiring raw OAuth or challenge secrets.

- [ ] **Step 5: Run and commit**

```bash
pnpm --filter @semogtw/database exec vitest run \
  src/agent-authorization-migrations.test.ts \
  src/adapters/sqlite-migrations.test.ts \
  src/backup/sqlite-backup.test.ts
pnpm --filter @semogtw/database typecheck
git add packages/database
git commit -m "feat: add agent authorization schema"
git push
```

---

### Task 4: Implement transactional profile and grant repositories

**Files:**
- Create: `packages/database/src/repositories/agent-profile-repository.ts`
- Create: `packages/database/src/repositories/agent-profile-repository.test.ts`
- Create: `packages/database/src/repositories/agent-grant-repository.ts`
- Create: `packages/database/src/repositories/agent-grant-repository.test.ts`
- Modify: `packages/database/src/index.ts`

**Interfaces:**

```ts
export interface AgentProfileRepository {
  listForOwner(ownerId: string): readonly AgentProfileRecord[];
  createCustom(input: CreateCustomAgentProfileRecord): AgentProfileRecord;
  updateCustom(input: UpdateCustomAgentProfileRecord): AgentProfileRecord | null;
  archiveCustom(input: ArchiveCustomAgentProfileRecord): boolean;
}

export interface AgentGrantRepository {
  createWithScopes(input: CreateAgentGrantRecord): AgentGrantRecord;
  findEffectiveForClient(input: {
    ownerId: string;
    clientId: string;
    now: string;
  }): readonly AgentGrantRecord[];
  updateWithScopes(input: UpdateAgentGrantRecord): AgentGrantRecord | null;
  suspend(input: AgentGrantStatusChange): boolean;
  revoke(input: AgentGrantStatusChange): boolean;
}
```

Rules:

- built-in profiles are immutable templates;
- custom profile names are owner-scoped and unique among active profiles;
- create/update persists capabilities/selectors and an authorization event atomically;
- the target `clientId` must belong to the same owner;
- optimistic conflict creates no partial capability/selector rows;
- revoking a grant also revokes its active trust sessions/challenges in the same transaction;
- no repository method authorizes its caller; authorization is performed by owner UI or policy composition before repository invocation.

- [ ] **Step 1: Write failing repository tests**

Cover built-in immutability, custom profile lifecycle, same-owner client enforcement, atomic nested rows, optimistic conflict, revoke cascade, expiry filtering and malformed selector rejection.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/database exec vitest run src/repositories/agent-profile-repository.test.ts src/repositories/agent-grant-repository.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement repositories**

Return normalized domain/application records; never return OAuth secret/token digests.

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/database exec vitest run src/repositories/agent-profile-repository.test.ts src/repositories/agent-grant-repository.test.ts
pnpm --filter @semogtw/database typecheck
git add packages/database/src/repositories packages/database/src/index.ts
git commit -m "feat: add agent profile and grant repositories"
git push
```

---

### Task 5: Compute effective grants with deny-by-default intersection

**Files:**
- Create: `packages/application/src/authorization/effective-grant.ts`
- Create: `packages/application/src/authorization/effective-grant.test.ts`
- Modify: `packages/application/src/index.ts`

**Interfaces:**

```ts
export type OAuthScope =
  | "devos.read"
  | "devos.write.attention"
  | "devos.write.projects"
  | "devos.write.roadmap"
  | "devos.write.workflow"
  | "devos.write.growth"
  | "devos.write.editorial"
  | "devos.write.appearance"
  | "devos.admin.request"
  | "devos.development.request";

export type EffectiveAgentAuthorization = {
  clientId: string;
  ownerId: string;
  capabilities: readonly AgentCapability[];
  resourceSelectors: Readonly<Record<string, readonly ResourceSelector[]>>;
  riskCeiling: "low" | "medium" | "high";
  grantIds: readonly string[];
  trustSessionIds: readonly string[];
};

export function computeEffectiveAgentAuthorization(input: {
  ownerId: string;
  clientId: string;
  oauthScopes: readonly OAuthScope[];
  grants: readonly AgentGrantDefinition[];
  trustSessions: readonly AgentTrustSession[];
  now: string;
}): EffectiveAgentAuthorization | null;
```

Intersection behavior:

- no active unexpired grant → `null`;
- capability must be present in an active grant and mapped to a matching OAuth scope;
- effective risk ceiling is the maximum allowed by at least one matching grant, but never above OAuth/policy capability constraints;
- resource selectors are unioned only among grants that independently authorize the capability;
- trust sessions may remove per-command confirmation only for their exact capability/resource and never add a capability absent from a base grant;
- suspended/revoked/expired rows contribute nothing;
- duplicate IDs/capabilities are normalized and sorted.

- [ ] **Step 1: Write failing intersection tests**

Test scope absent, grant absent, wrong owner/client, resource mismatch, two narrow grants, trust not adding capability, expired trust, risk ceiling and deterministic ordering.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/application exec vitest run src/authorization/effective-grant.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement pure computation**

Do not read persistence or current command state inside this module.

- [ ] **Step 4: Run and commit**

```bash
pnpm --filter @semogtw/application exec vitest run src/authorization/effective-grant.test.ts
pnpm --filter @semogtw/application typecheck
git add packages/application/src
git commit -m "feat: compute effective agent authorization"
git push
```

---

### Task 6: Implement bounded temporary trust sessions

**Files:**
- Create: `packages/application/src/authorization/trust-session.ts`
- Create: `packages/application/src/authorization/trust-session.test.ts`
- Create: `packages/database/src/repositories/agent-trust-session-repository.ts`
- Create: `packages/database/src/repositories/agent-trust-session-repository.test.ts`
- Modify: package indexes.

**Interfaces:**

```ts
export type AgentTrustSession = {
  id: string;
  ownerId: string;
  clientId: string;
  baseGrantIds: readonly string[];
  capabilities: readonly AgentCapability[];
  resourceSelectors: Readonly<Record<string, readonly ResourceSelector[]>>;
  riskCeiling: "low" | "medium";
  startsAt: string;
  expiresAt: string;
  maxOperations: number;
  operationsUsed: number;
  revokedAt: string | null;
  reason: string;
  version: number;
};

export function validateTrustSessionRequest(input: {
  durationMinutes: number;
  maxOperations: number;
  riskCeiling: "low" | "medium";
  requestedCapabilities: readonly AgentCapability[];
  requestedResources: Readonly<Record<string, readonly ResourceSelector[]>>;
  baseAuthorization: EffectiveAgentAuthorization;
}): void;
```

Fixed bounds:

```text
default duration: 120 minutes
maximum duration: 480 minutes
minimum duration: 5 minutes
default maximum operations: 25
maximum operations: 100
critical risk: impossible
```

- [ ] **Step 1: Write failing domain tests**

Test duration/count bounds, capability/resource subset, critical exclusion, no session-to-session delegation and expiry/revocation/operation exhaustion.

- [ ] **Step 2: Write failing repository tests**

Prove create + authorization event atomicity, operation increment with optimistic concurrency, auto-exhaustion, revocation and grant-revoke cascade.

- [ ] **Step 3: Run and verify failure**

```bash
pnpm --filter @semogtw/application exec vitest run src/authorization/trust-session.test.ts
pnpm --filter @semogtw/database exec vitest run src/repositories/agent-trust-session-repository.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement pure validation and repository**

Operation consumption occurs in the same transaction as the later command receipt/domain write; expose a transaction-bound `consumeIfAvailable()` method.

- [ ] **Step 5: Run and commit**

```bash
pnpm --filter @semogtw/application exec vitest run src/authorization/trust-session.test.ts
pnpm --filter @semogtw/database exec vitest run src/repositories/agent-trust-session-repository.test.ts
pnpm --filter @semogtw/application typecheck
pnpm --filter @semogtw/database typecheck
git add packages/application/src packages/database/src
git commit -m "feat: add bounded agent trust sessions"
git push
```

---

### Task 7: Implement independent write kill switches

**Files:**
- Create: `packages/database/src/repositories/agent-write-switch-repository.ts`
- Create: `packages/database/src/repositories/agent-write-switch-repository.test.ts`
- Create: `packages/application/src/authorization/write-switches.ts`
- Create: `packages/application/src/authorization/write-switches.test.ts`
- Modify: package indexes.

**Interfaces:**

```ts
export type AgentWriteSwitchState = {
  globalEnabled: boolean;
  clientEnabled: boolean;
  domainEnabled: boolean;
};

export function writesAllowed(input: AgentWriteSwitchState): boolean;

export interface AgentWriteSwitchRepository {
  readEffective(input: {
    ownerId: string;
    clientId: string;
    domain: string;
  }): AgentWriteSwitchState;
  set(input: {
    ownerId: string;
    scopeKind: "global" | "client" | "domain";
    scopeRef: string;
    enabled: boolean;
    reason: string;
    expectedVersion: number;
    actorId: string;
    now: string;
  }): boolean;
}
```

Rules:

- all three must be enabled for a remote write;
- global defaults disabled;
- reads never call `writesAllowed()`;
- client cannot call the switch mutation governing itself;
- switch change + authorization event commit atomically;
- disabling is allowed immediately; enabling requires owner UI confirmation;
- later critical policy may require recent authentication for global enablement.

- [ ] **Step 1: Write failing pure/repository tests**

Assert every false combination denies, missing row denies, immediate disable, optimistic conflict, same-client mutation denial in service layer and read independence.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/application exec vitest run src/authorization/write-switches.test.ts
pnpm --filter @semogtw/database exec vitest run src/repositories/agent-write-switch-repository.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement and commit**

```bash
pnpm --filter @semogtw/application exec vitest run src/authorization/write-switches.test.ts
pnpm --filter @semogtw/database exec vitest run src/repositories/agent-write-switch-repository.test.ts
git add packages/application/src packages/database/src
git commit -m "feat: add remote write kill switches"
git push
```

---

### Task 8: Implement confirmation challenge binding and replay protection

**Files:**
- Create: `packages/application/src/authorization/confirmation-challenge.ts`
- Create: `packages/application/src/authorization/confirmation-challenge.test.ts`
- Create: `packages/database/src/repositories/confirmation-challenge-repository.ts`
- Create: `packages/database/src/repositories/confirmation-challenge-repository.test.ts`
- Modify: package indexes.

**Interfaces:**

```ts
export type ConfirmationChallengePublic = {
  challengeId: string;
  commandId: string;
  commandVersion: number;
  risk: "medium" | "high";
  summary: string;
  expiresAt: string;
  responseToken: string;
};

export interface ConfirmationChallengeService {
  create(input: {
    clientId: string;
    commandId: string;
    commandVersion: number;
    payloadSha256: string;
    resourceSnapshotSha256: string;
    risk: "medium" | "high";
    summary: string;
    now: string;
  }): Promise<ConfirmationChallengePublic>;
  consume(input: {
    challengeId: string;
    clientId: string;
    commandId: string;
    commandVersion: number;
    payloadSha256: string;
    resourceSnapshotSha256: string;
    responseToken: string;
    now: string;
  }): Promise<boolean>;
}
```

Fixed behavior:

```text
TTL: 10 minutes
single use: yes
response token bytes: at least 32 random bytes
stored value: SHA-256 digest only
risk supported: medium/high only
critical: rejected
```

- [ ] **Step 1: Write failing service tests**

Test exact binding to every field, modified payload/resource/client/command rejection, expiry, replay, revoked client/grant and no raw response persistence.

- [ ] **Step 2: Write failing repository tests**

Test atomic consume, concurrent consume only one success, challenge revocation on grant/client revoke and backup digest preservation.

- [ ] **Step 3: Run and verify failure**

```bash
pnpm --filter @semogtw/application exec vitest run src/authorization/confirmation-challenge.test.ts
pnpm --filter @semogtw/database exec vitest run src/repositories/confirmation-challenge-repository.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement with injected random/digest ports**

Return the raw response token exactly once. Do not log or expose it in DevOS history after creation.

- [ ] **Step 5: Run and commit**

```bash
pnpm --filter @semogtw/application exec vitest run src/authorization/confirmation-challenge.test.ts
pnpm --filter @semogtw/database exec vitest run src/repositories/confirmation-challenge-repository.test.ts
git add packages/application/src packages/database/src
git commit -m "feat: add agent confirmation challenges"
git push
```

---

### Task 9: Implement the effective agent command policy

**Files:**
- Create: `packages/application/src/authorization/policy-engine.ts`
- Create: `packages/application/src/authorization/policy-engine.test.ts`
- Create: `packages/database/src/composition/agent-command-policy.ts`
- Create: `packages/database/src/composition/agent-command-policy.test.ts`
- Modify: `packages/database/src/composition/devos-command-gateway.ts`
- Modify: package indexes.

**Interfaces:**

```ts
export function decideAgentCommandDisposition(input: {
  authorization: EffectiveAgentAuthorization | null;
  command: {
    capability: AgentCapability;
    domain: string;
    risk: CommandRisk;
    resource: CommandResource;
  };
  writeSwitches: AgentWriteSwitchState;
  trustCoversCommand: boolean;
  confirmationValid: boolean;
}): CommandPolicyDecision;
```

Decision order:

```text
1. no authorization → deny / NO_EFFECTIVE_GRANT
2. write switch false → deny / REMOTE_WRITES_DISABLED
3. capability absent → deny / CAPABILITY_DENIED
4. resource mismatch → deny / RESOURCE_DENIED
5. risk above grant ceiling → deny / RISK_CEILING_EXCEEDED
6. critical → approve_in_devos / DEVOS_APPROVAL_REQUIRED
7. high → prepare_approval unless a later owner policy explicitly permits client confirmation
8. medium + matching trust → allow
9. medium + valid challenge → allow
10. medium → confirm_in_client
11. low → allow
```

No client-provided disposition/risk/selector participates in the decision.

- [ ] **Step 1: Write a full table-driven policy matrix**

Include every decision-order branch and precedence test proving kill switches override trust/challenges/grants.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/application exec vitest run src/authorization/policy-engine.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement pure policy**

Return only stable reason codes; no hidden resource details in denials.

- [ ] **Step 4: Implement database composition**

The composition loads OAuth scopes, active grants, selectors, trust, switches and challenge state only after token/client/owner authentication. It supplies the policy to the existing `CommandGateway`.

- [ ] **Step 5: Write/run integration tests**

```bash
pnpm --filter @semogtw/database exec vitest run src/composition/agent-command-policy.test.ts
pnpm --filter @semogtw/application test
pnpm --filter @semogtw/database test
```

Prove trust-operation consumption and command receipt/domain mutation commit in the same transaction for a test command.

- [ ] **Step 6: Commit**

```bash
git add packages/application/src packages/database/src
git commit -m "feat: enforce effective agent command policy"
git push
```

---

### Task 10: Extend MCP OAuth scopes and filtered discovery

**Files:**
- Create or Modify: `packages/mcp-auth/src/scopes.ts`
- Create or Modify: `packages/mcp-auth/src/scopes.test.ts`
- Create: `packages/mcp/src/authorization-discovery.ts`
- Create: `packages/mcp/src/authorization-discovery.test.ts`
- Modify: `packages/mcp/src/catalog.ts`
- Modify: `packages/mcp/src/index.ts`
- Modify: remote MCP consent/client-management code from the existing remote plan.

**Canonical OAuth scopes:**

```text
devos.read
devos.write.attention
devos.write.projects
devos.write.roadmap
devos.write.workflow
devos.write.growth
devos.write.editorial
devos.write.appearance
devos.admin.request
devos.development.request
```

Rules:

- existing clients retain only previously granted scopes;
- no migration silently adds write scopes;
- authorization consent shows each requested scope in Portuguese;
- token exchange/refresh cannot broaden scopes;
- discovery is filtered by both OAuth scopes and effective grants/resources;
- discovery never reveals hidden entity existence, other clients, secrets or policy internals;
- no write tool is registered merely because a scope exists.

**Discovery tools:**

```text
devos_list_capabilities
devos_list_commands
devos_get_command_schema
devos_explain_authorization
devos_get_entity_actions
```

These return bounded metadata only. `devos_get_command_schema` returns an allowlisted JSON-schema-like representation generated from registered command metadata; it never serializes handler functions or arbitrary Zod internals.

- [ ] **Step 1: Write failing scope tests**

Test exact scope parsing, no wildcard scope, no implicit write from `devos.read`, consent copy and refresh non-escalation.

- [ ] **Step 2: Write failing discovery tests**

Test filtered command/capability/resource behavior, no grant/no results, wrong resource hidden, bounded schema and no generic execute tool.

- [ ] **Step 3: Run and verify failure**

```bash
pnpm --filter @semogtw/mcp-auth exec vitest run src/scopes.test.ts
pnpm --filter @semogtw/mcp exec vitest run src/authorization-discovery.test.ts
```

Expected: FAIL or explicitly blocked if the remote MCP package is not yet implemented.

- [ ] **Step 4: Implement only after the remote read gate is green**

When blocked, commit no partial externally reachable write scope. Keep pure tests/code on an isolated branch until the prerequisite lands.

- [ ] **Step 5: Run protocol/security gates**

```bash
pnpm --filter @semogtw/mcp-auth test
pnpm --filter @semogtw/mcp test
pnpm check:mcp-package-boundaries
pnpm check:mcp-transport-boundary
pnpm check:mcp-node-runtime-boundary
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp-auth packages/mcp apps/mcp-http apps/web/src
git commit -m "feat: add scoped agent command discovery"
git push
```

---

### Task 11: Build owner-only agent management and switch UI

**Files:**
- Create: `apps/web/src/server/devos-agent-management.ts`
- Create: `apps/web/src/server/devos-agent-management.test.ts`
- Create: `apps/web/src/server/devos-agent-trust.ts`
- Create: `apps/web/src/server/devos-agent-trust.test.ts`
- Create: `apps/web/src/server/devos-remote-write-switches.ts`
- Create: `apps/web/src/server/devos-remote-write-switches.test.ts`
- Create: route/component/style files from the planned structure.
- Modify: `apps/web/src/components/devos/devos-shell.tsx` and navigation components.

**Owner flows:**

```text
List connected OAuth clients and effective write state
Assign a built-in/custom profile
Select explicit capabilities
Restrict canonical resources
Set risk ceiling
Create/revoke a temporary trust session
Suspend/revoke a grant
Pause one client's writes
Pause one domain's writes
Pause all remote writes
```

The UI must show:

- write access is off by default;
- OAuth scopes and command capabilities are different layers;
- exact resource filters;
- trust expiry and remaining operations;
- last bounded activity timestamp;
- no token/client-secret/challenge response;
- no button allowing the currently represented client to grant itself access.

- [ ] **Step 1: Write failing server tests**

Test owner auth/CSRF, same-owner client resolution, expected version, no self-escalation through agent principal, atomic grant/event writes, immediate disable, confirmation on enable and bounded trust defaults.

- [ ] **Step 2: Write failing component tests**

Test progressive disclosure, explicit `Todos os recursos` warning, resource ID selection, trust duration/operation bounds, switch status text and 360 px layout.

- [ ] **Step 3: Run and verify failure**

```bash
pnpm --filter @semogtw/web exec vitest run \
  src/server/devos-agent-management.test.ts \
  src/server/devos-agent-trust.test.ts \
  src/server/devos-remote-write-switches.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement server handlers through canonical owner-browser commands**

Agent administration itself must be represented by registered high/critical commands. During this plan, critical enablement may remain unavailable until the approvals plan; disabling/revoking is allowed through an emergency-safe owner path with audit.

- [ ] **Step 5: Implement routes/components**

Use cards/forms/disclosures, not raw grant tables as the normal flow. Audit/technical detail may use a dense advanced view.

- [ ] **Step 6: Run focused tests/typecheck and commit**

```bash
pnpm --filter @semogtw/web test
pnpm --filter @semogtw/web typecheck
git add apps/web/src packages/ui/src
git commit -m "feat: add supervised agent access controls"
git push
```

---

### Task 12: Verify authorization, revocation and no-self-escalation end to end

**Files:**
- Create: `tests/e2e/agent-write-authorization.spec.ts`
- Modify: `docs/testing/2026-08-03-agent-write-authorization-test-matrix.md`
- Modify: `docs/architecture/EDITABILITY_COVERAGE.md`
- Modify: `docs/MCP.md`
- Modify: `SECURITY.md`
- Modify: `RUNBOOK.md`
- Modify: `CHANGELOG.md`

**E2E/protocol scenarios:**

1. create/register an OAuth client with read-only scope;
2. verify write discovery is empty;
3. owner creates a narrow attention grant but global writes remain disabled;
4. verify write still denied;
5. owner enables global + client + attention-domain switches through allowed owner flow;
6. verify `attention.transition` appears only for the allowed attention resource;
7. request medium command and receive confirmation challenge;
8. modified payload/challenge replay fails;
9. valid challenge executes exactly once and writes one receipt/audit;
10. create two-hour/one-operation trust, execute once, verify second requires confirmation;
11. revoke grant/client and verify old tokens/challenges/emails cannot authorize reads/writes;
12. attempt client self-grant/self-switch/self-trust and verify denial;
13. disable global writes and prove reads still work;
14. verify public output contains no client/grant/challenge/resource data.

- [ ] **Step 1: Implement test fixtures and E2E**

Use synthetic client secrets/tokens only in test storage. Redact them from snapshots/log output.

- [ ] **Step 2: Run focused gates**

```bash
pnpm check:editability-coverage
pnpm check:public-confidentiality
pnpm check:mcp-package-boundaries
pnpm check:mcp-transport-boundary
pnpm --filter @semogtw/application test
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/mcp-auth test
pnpm --filter @semogtw/mcp test
pnpm --filter @semogtw/web test
pnpm --filter @semogtw/web typecheck
pnpm --filter @semogtw/web build
pnpm exec playwright test tests/e2e/agent-write-authorization.spec.ts
```

- [ ] **Step 3: Run secret/log scans**

```bash
rg -n "client_secret|access_token|refresh_token|responseToken|nonce_digest|authorization:" \
  apps/*/dist test-results playwright-report logs docs/testing
```

Expected: no raw secret values; schema/field names may appear only in server/test documentation.

- [ ] **Step 4: Rehearse emergency controls**

Record exact evidence for:

```text
global write disable
single-client pause
single-domain pause
client/token/grant revocation
trust expiry/revocation
challenge expiry/replay rejection
reads remaining available
```

- [ ] **Step 5: Update documentation and commit**

Document observed scopes/routes/tables/runbook operations and link to the canonical unified specification. Do not duplicate its complete policy matrix.

```bash
git add tests/e2e/agent-write-authorization.spec.ts \
  docs/testing/2026-08-03-agent-write-authorization-test-matrix.md \
  docs/architecture/EDITABILITY_COVERAGE.md docs/MCP.md SECURITY.md RUNBOOK.md CHANGELOG.md
git commit -m "test: verify supervised agent authorization"
git push
```

## Acceptance criteria

This plan is complete only when:

- every remote write is default-denied;
- OAuth scopes, client status, capabilities, resource selectors, risk ceiling and switches are all enforced;
- provider/model metadata cannot authorize;
- resource selectors cannot use caller regex/display-name expansion;
- temporary trust is a subset of a base grant, bounded and never critical;
- confirmation challenges are digest-only, one-use, short-lived and payload/resource bound;
- kill switches override grants/trust/challenges while preserving reads;
- client self-escalation is impossible through the governed channel;
- discovery is filtered and exposes no generic mutation tool;
- no write scope is silently added to existing clients;
- grant/trust/challenge operations are owner-visible and audited;
- revocation invalidates later access/confirmation attempts;
- 360 px UI, protocol tests, public confidentiality and secret scans pass;
- concrete domain writes remain separately inventoried and gated.
