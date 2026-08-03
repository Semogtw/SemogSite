# Semogtw Command Gateway and Editability Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Track progress with the checkboxes below.

**Goal:** Introduce one framework-free command path for owner UI, future MCP clients and internal jobs, with strict schemas, resource/risk metadata, durable idempotency and machine-checked editability coverage.

**Architecture:** Add `@semogtw/application` between transports and existing domain services. A registry parses and classifies commands; a policy returns allow/confirmation/approval/deny; a transaction-bound SQLite execution adapter couples domain writes, events/audit and idempotency receipts. Existing browser writes migrate incrementally without moving business invariants out of domain services.

**Tech Stack:** Node.js 22, TypeScript strict mode, Zod, Vitest, SQLite/Drizzle with `better-sqlite3`, TanStack Start, pnpm workspaces and existing Semogtw packages.

## Constraints

- Start from the newest consolidated branch containing the unified-editability specification.
- Reconcile migration numbering; this plan currently reserves `0017_command_core.sql` after `0014`–`0016`.
- `@semogtw/application` imports no React, TanStack, Hono, ORM, SQLite, MCP SDK, filesystem, shell or host-specific runtime.
- Existing domain services remain canonical for business invariants and domain events/audit content.
- Caller metadata cannot lower risk, grant resources, select handlers or supply principal identity.
- Command IDs are stable lowercase dotted identifiers and semantic breaking changes increment command version.
- Inputs/outputs are strict, bounded and schema validated.
- Successful domain mutation, domain event/audit and idempotency receipt commit atomically for migrated commands.
- Same principal/command/key/payload replays the original result; changed payload conflicts.
- High/critical execution remains unavailable until the approval plan passes.
- Remote MCP writes remain unavailable until remote read/OAuth gates and agent authorization pass.
- Public routes/DTOs never expose receipts, principals, hidden commands or private resources.
- Commit and push after each independently reviewable task.

## Planned files

```text
packages/application/package.json
packages/application/tsconfig.json
packages/application/src/index.ts
packages/application/src/commands/types.ts
packages/application/src/commands/canonical-json.ts
packages/application/src/commands/canonical-json.test.ts
packages/application/src/commands/registry.ts
packages/application/src/commands/registry.test.ts
packages/application/src/commands/gateway.ts
packages/application/src/commands/gateway.test.ts
packages/application/src/commands/owner-browser-policy.ts
packages/application/src/commands/owner-browser-policy.test.ts
packages/application/src/commands/editability-manifest.ts
packages/application/src/commands/editability-manifest.test.ts
packages/application/src/attention/transition-attention-command.ts
packages/application/src/attention/transition-attention-command.test.ts
packages/application/src/roadmap/complete-stage-command.ts
packages/application/src/roadmap/complete-stage-command.test.ts
packages/database/migrations/0017_command_core.sql
packages/database/src/schema/command-core.ts
packages/database/src/repositories/command-receipt-repository.ts
packages/database/src/repositories/command-receipt-repository.test.ts
packages/database/src/composition/devos-command-registry.ts
packages/database/src/composition/devos-command-gateway.ts
packages/database/src/composition/devos-command-gateway.test.ts
apps/web/src/server/devos-command-gateway.server.ts
apps/web/src/server/devos-entity-actions.ts
apps/web/src/server/devos-entity-actions.test.ts
scripts/check-editability-coverage.mjs
scripts/check-editability-coverage.test.mjs
docs/architecture/EDITABILITY_COVERAGE.md
docs/testing/2026-08-03-command-gateway-editability-test-matrix.md
tests/e2e/command-gateway-owner-parity.spec.ts
```

---

### Task 1: Inventory current mutations and reserve migration 0017

**Files:** Create coverage and test-matrix docs; update the stack index.

- [ ] Capture exact head, migrations and all observed mutation entry points.

```bash
git fetch --all --prune
git status --short --branch
git rev-parse HEAD
ls packages/database/migrations | sort
rg -n "createServerFn\(\{ method: \"POST\"|\.post\(|transitionWithAudit|WithAudit\(" apps packages
rg -n "001[4-9]_|002[0-2]_" packages/database/migrations docs/superpowers
```

- [ ] Create `EDITABILITY_COVERAGE.md` with one row per mutation:

```text
Feature | UI entry | Server handler | Domain service | Audit action | Conflict strategy | Command ID | Risk floor | MCP exposure | State
```

Initial pilot rows:

```text
Attention lifecycle | attention.transition | medium | expected current state | later
Stage completion | roadmap.stages.complete | high | expected version/evidence | later
```

No row may remain `unclassified` at commit.

- [ ] Verify `0017_command_core.sql` is unused or renumber all unimplemented reservations together.
- [ ] Run and record exact baseline results.

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

- [ ] Commit and push.

### Task 2: Create framework-free application package and canonical hashing

**Files:** Create package scaffold, command types, canonical JSON/hash and tests; update workspace test config/lockfile.

```ts
export type CommandRisk = "low" | "medium" | "high" | "critical";
export type CommandDisposition =
  | "allow"
  | "confirm_in_client"
  | "prepare_approval"
  | "approve_in_devos"
  | "deny";

export type CommandPrincipal = {
  ownerId: string;
  kind: "owner_browser" | "mcp_client" | "internal_job" | "development_executor";
  sessionId: string | null;
  clientId: string | null;
  declaredProvider: string | null;
  declaredModel: string | null;
  grantIds: readonly string[];
};

export type CommandResource = {
  kind: string;
  id: string;
  parentRefs: readonly { kind: string; id: string }[];
};

export type CommandExpectedState =
  | { strategy: "none" }
  | { strategy: "entity_version"; entityId: string; version: number }
  | { strategy: "snapshot_hash"; entityId: string; sha256: string }
  | { strategy: "exact_sha"; repository: string; sha: string };

export type CommandConfirmation =
  | { kind: "none" }
  | { kind: "owner_ui"; confirmed: true }
  | { kind: "client_challenge"; challengeId: string; response: string }
  | { kind: "devos_approval"; approvalId: string };

export type CommandEnvelope<Input> = {
  commandId: string;
  input: Input;
  principal: CommandPrincipal;
  idempotencyKey: string;
  reason: string;
  expectedState: CommandExpectedState;
  confirmation: CommandConfirmation;
  correlationId: string;
  requestedAt: string;
};

export type CommandDefinition<Input, Output> = {
  id: string;
  version: number;
  domain: string;
  capability: string;
  resourceKind: string;
  staticRiskFloor: CommandRisk;
  batchable: boolean;
  supportsCompensation: boolean;
  inputSchema: z.ZodType<Input>;
  outputSchema: z.ZodType<Output>;
  resolveResource(input: Input): CommandResource;
  classifyRisk(input: Input, currentState: unknown): CommandRisk;
  execute(context: CommandExecutionContext, input: Input): Promise<Output>;
};
```

- [ ] Write failing canonical JSON tests: recursive key sorting, array order preservation, equivalent hash, rejection of undefined/bigint/functions/non-finite values.
- [ ] Implement `canonicalizeJson()` and `sha256CanonicalJson()` with Web Crypto SHA-256 and lowercase hex.
- [ ] Create `@semogtw/application` with only `@semogtw/domain` and Zod runtime dependencies.
- [ ] Run application tests/typecheck and boundary checks.

```bash
pnpm install --lockfile-only
pnpm --filter @semogtw/application test
pnpm --filter @semogtw/application typecheck
pnpm check:boundaries
```

- [ ] Commit and push.

### Task 3: Implement command registry and risk-floor enforcement

**Files:** Create registry/tests and exports.

```ts
export class CommandRegistry {
  constructor(definitions: readonly AnyCommandDefinition[]);
  get(commandId: string): AnyCommandDefinition | null;
  list(): readonly CommandMetadata[];
}

export function assertRiskAtLeastFloor(
  floor: CommandRisk,
  classified: CommandRisk,
): void;
```

Invariants:

- ID regex `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$`;
- positive integer version;
- unique IDs;
- bounded non-empty capability/resource kind;
- dynamic risk cannot rank below static floor;
- listed metadata excludes Zod internals and handlers.

- [ ] Write failing tests for lookup, stable sorted list, duplicate/invalid IDs and risk downgrade.
- [ ] Implement risk rank `low=0`, `medium=1`, `high=2`, `critical=3`.
- [ ] Run tests/typecheck and commit.

### Task 4: Implement gateway preparation and owner-browser policy

**Files:** Create gateway/policy/tests and exports.

```ts
export interface CommandPolicy {
  evaluate(input: CommandPolicyInput): Promise<CommandPolicyDecision>;
}

export type PreparedCommand = {
  definition: AnyCommandDefinition;
  parsedInput: unknown;
  resource: CommandResource;
  risk: CommandRisk;
  payloadHash: string;
  decision: CommandPolicyDecision;
  envelope: CommandEnvelope<unknown>;
};

export type CommandExecutionPort = {
  execute(prepared: PreparedCommand): Promise<CommandGatewayResult>;
};

export class CommandGateway {
  constructor(
    registry: CommandRegistry,
    policy: CommandPolicy,
    execution: CommandExecutionPort,
  );
  execute(envelope: CommandEnvelope<unknown>): Promise<CommandGatewayResult>;
}
```

Owner-browser phase-A policy:

```text
non-owner-browser → deny / PRINCIPAL_NOT_SUPPORTED
low + owner → allow
medium + owner_ui confirmation → allow
medium without confirmation → confirm_in_client
high → prepare_approval
critical → approve_in_devos
```

Validation order:

```text
envelope bounds → registry → input parse → resource resolution → risk/floor → payload hash → policy → execution only on allow → output parse
```

- [ ] Write table-driven policy tests and gateway tests for unknown command, invalid input, server risk, resource-before-policy, denied/no execution, approval dispositions, output-schema rejection and sanitized codes.
- [ ] Implement without returning Zod values/raw exceptions.
- [ ] Run tests/typecheck and commit.

### Task 5: Add migration 0017 and durable command receipts

**Files:** Create migration/schema/repository/tests; update migrations/backup tests.

```sql
CREATE TABLE command_receipts (
  id TEXT PRIMARY KEY NOT NULL,
  principal_key TEXT NOT NULL,
  command_id TEXT NOT NULL,
  command_version INTEGER NOT NULL CHECK (command_version > 0),
  idempotency_key TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL CHECK (length(payload_sha256) = 64),
  status TEXT NOT NULL CHECK (status IN ('running', 'executed', 'failed')),
  result_json TEXT,
  result_sha256 TEXT,
  stable_error_code TEXT,
  audit_id TEXT,
  correlation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  expires_at TEXT NOT NULL,
  UNIQUE (principal_key, command_id, idempotency_key)
);
```

```ts
export type CommandReceiptClaim =
  | { kind: "claimed"; receiptId: string }
  | { kind: "replay"; resultJson: string; auditId: string | null }
  | { kind: "in_progress" }
  | { kind: "payload_conflict" };
```

Rules:

- server-derived opaque principal key;
- no raw input/token/secret/private body;
- bounded allowlisted result JSON max 64 KiB;
- failed receipt stores only stable code;
- expired running leases require explicit recovery code, not blind rerun;
- transaction-bound repository uses the caller’s database transaction.

- [ ] Write failing tests for migration twice, unique claim, replay/conflict, result bound, absence of raw-input columns, rollback and backup/restore.
- [ ] Implement schema/repository.
- [ ] Run database tests/typecheck and commit.

### Task 6: Register `attention.transition` as the pilot command

**Files:** Create attention command/tests, transaction-bind existing attention repository/service, create registry composition.

```ts
export const TransitionAttentionInputSchema = z.object({
  attentionId: z.string().trim().min(1).max(200),
  targetStatus: z.enum(["resolved", "dismissed"]),
  reason: z.string().trim().min(1).max(500),
});
```

Metadata:

```text
id: attention.transition
version: 1
capability: attention.write
resourceKind: attention_item
risk floor: medium
batchable: true
supports compensation: false
```

- [ ] Write failing tests for metadata/schema/resource/risk/domain mapping/output/conflict.
- [ ] Implement a thin adapter over `AttentionLifecycleService`; policy confirmation occurs before calling the legacy confirmed transition.
- [ ] Build transaction-bound service/repository registry composition.
- [ ] Run application/database/boundary tests and commit.

### Task 7: Implement atomic SQLite command execution

**Files:** Create `devos-command-gateway.ts`, integration tests and exports.

```ts
export function createSqliteDevOSCommandGateway(input: {
  database: SemogtwDatabase;
  policy: CommandPolicy;
  now: () => string;
  randomUUID: () => string;
}): CommandGateway;
```

Atomic sequence:

```text
derive principal key → claim receipt → replay/conflict short circuit → transaction-bound registry → execute domain command → validate/serialize/hash result → finalize receipt → commit
```

Stable mappings:

```text
payload conflict → IDEMPOTENCY_PAYLOAD_CONFLICT
running → COMMAND_ALREADY_RUNNING
domain conflict → COMMAND_TARGET_CHANGED
not found → COMMAND_TARGET_NOT_FOUND
validation → COMMAND_VALIDATION_FAILED
unexpected → COMMAND_EXECUTION_FAILED
```

- [ ] Write integration tests proving mutation/audit/receipt atomicity, forced finalization rollback, stable failure receipt only without partial domain write, replay without second audit, changed-payload conflict and no receipt for denied/approval-required requests.
- [ ] Ensure command handlers use repositories created from the transaction handle.
- [ ] Run tests/typecheck and commit.

### Task 8: Migrate attention browser write to the gateway

**Files:** Create web gateway composition/tests; modify attention server handler/form/tests.

```ts
export async function getOwnerBrowserCommandGateway(input: {
  ownerId: string;
  sessionId: string;
}): Promise<CommandGateway | null>;
```

The existing attention server function retains its human-facing request but adds a UUID idempotency key. It constructs server-owned:

```text
commandId=attention.transition
owner_browser principal
reason
confirmation=owner_ui confirmed
correlation ID/requestedAt
```

- [ ] Write failing tests for owner/CSRF before DB access, server-owned command/principal/risk, replay/conflict and unchanged Portuguese copy.
- [ ] Remove direct service construction from the migrated web handler.
- [ ] Run web tests/typecheck and commit.

### Task 9: Register guarded stage completion and defer browser migration until approvals

**Files:** Create stage command/tests; transaction-bind service/repository; modify registry/coverage.

Metadata:

```text
id: roadmap.stages.complete
version: 1
capability: roadmap.write
resourceKind: stage
risk floor: high
batchable: false
supports compensation: true
```

- [ ] Write tests for strict input/output/resource, high floor, exact evidence/version and non-execution under phase-A policy.
- [ ] Implement command adapter over existing `StageCompletionService`.
- [ ] Register it but leave the existing production browser path unchanged until approval storage/execution exists.
- [ ] Mark coverage `registered=true`, `browser_gateway=false`, reason `awaiting_high_risk_approval_path`.
- [ ] After approval plan passes, add preview→approval→stale-safe execution tests and migrate the browser handler in a separate commit.

### Task 10: Add editability manifests and static completeness guard

**Files:** Create manifest types/tests, guardrail script/fixtures; modify root scripts and initial command modules.

```ts
export type EditabilityManifest = {
  featureId: string;
  reads: readonly string[];
  commands: readonly string[];
  uiRoutes: readonly string[];
  mcpExposure: "direct" | "change_set_only" | "control_plane" | "not_yet";
  riskSummary: Readonly<Record<string, CommandRisk>>;
  undoStrategy: "compensating_command" | "new_revision" | "not_reversible";
  conflictStrategy: "expected_version" | "snapshot_hash" | "exact_sha" | "immutable";
  auditEvents: readonly string[];
  implementationState: "planned" | "partial" | "complete";
};
```

Required failures:

```text
DUPLICATE_FEATURE_ID
UNKNOWN_COMMAND_ID
COMMAND_WITHOUT_MANIFEST
MUTATION_FILE_WITHOUT_MANIFEST_REFERENCE
UI_ROUTE_MISSING
RISK_SUMMARY_MISMATCH
CONFLICT_STRATEGY_MISSING
AUDIT_EVENT_MISSING
CRITICAL_WITHOUT_APPROVAL_PATH
COMPLETE_FEATURE_WITH_NOT_YET_MCP_STRATEGY
```

- [ ] Write failing manifest tests and temporary-repository script fixtures.
- [ ] Use semantic manifest imports/generated data; do not rely solely on fragile regex. Source scanning may detect unregistered mutation adapters.
- [ ] Add `check:editability-coverage` to `pnpm check`.
- [ ] Add attention and stage-completion manifests, run tests/check and commit.

### Task 11: Add explicit owner entity-action discovery

**Files:** Create server handler/tests and a minimal authenticated DevOS disclosure.

```ts
export type OwnerEntityAction = {
  commandId: string;
  labelPtBr: string;
  risk: CommandRisk;
  reversible: boolean;
  availability: "available" | "confirmation_required" | "approval_required" | "planned";
};

export async function handleGetOwnerEntityActions(input: {
  data: {
    resourceKind: string;
    resourceId: string;
  };
}): Promise<readonly OwnerEntityAction[]>;

export const getOwnerEntityActionsFn = createServerFn({ method: "GET" })
  .validator(
    z.object({
      resourceKind: z.string().min(1).max(120),
      resourceId: z.string().min(1).max(200),
    }),
  )
  .handler(handleGetOwnerEntityActions);
```

`handleGetOwnerEntityActions` must:

1. resolve the owner before resource lookup;
2. resolve the exact canonical resource without revealing hidden existence on denial;
3. filter registry/manifests through owner-browser policy;
4. map allow/confirmation/approval/partial state to `OwnerEntityAction`;
5. return no input/output schema, handler, grant or hidden resource metadata.

- [ ] Write failing tests for unauthenticated denial, exact resource filtering, Portuguese labels, high approval state and bounded metadata.
- [ ] Implement the named handler/function explicitly; no inline placeholder callback.
- [ ] Render an `Ações disponíveis` disclosure, not a raw command table.
- [ ] Run web tests/typecheck and commit.

### Task 12: Verify parity, idempotency, rollback and confidentiality

**Files:** Create E2E and update test matrix/coverage/architecture/data/security/changelog by reference.

E2E:

1. owner resolves an attention item through current UI;
2. replay same request/key produces one mutation/audit/receipt;
3. same key changed payload conflicts;
4. action discovery lists `attention.transition`;
5. stage completion is registered but approval-gated;
6. logout/private endpoint denial occurs before DB read;
7. public HTML/assets contain no command/receipt/principal/private markers.

Run:

```bash
pnpm check:editability-coverage
pnpm check:boundaries
pnpm check:public-confidentiality
pnpm --filter @semogtw/application test
pnpm --filter @semogtw/domain test
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/web test
pnpm --filter @semogtw/web typecheck
pnpm --filter @semogtw/web build
pnpm exec playwright test tests/e2e/command-gateway-owner-parity.spec.ts
pnpm check
pnpm build
```

- [ ] Inspect production output for private value leakage, not merely identifier strings in server bundles.
- [ ] Scan migrated code/plans for direct-service bypasses and unresolved placeholders.
- [ ] Record exact results against exact head; classify unavailable gates honestly.
- [ ] Update docs with observed package/table/command state and links to canonical specification.
- [ ] Commit and push closeout.

## Acceptance criteria

- `@semogtw/application` remains framework/persistence/provider neutral;
- command IDs/versions/schemas/resources/risks are registered and validated;
- risk cannot fall below static floor;
- owner low/medium policy is deterministic and high/critical stay blocked until approvals;
- durable receipts are bounded and contain no raw inputs/secrets;
- pilot mutation/event/audit/receipt commits atomically;
- replay/conflict/concurrency behavior is tested;
- attention browser write uses the gateway without duplicate rules;
- stage completion is registered and safely gated;
- manifests/CI detect untracked writes;
- owner discovery is resource-filtered and schema-free;
- public confidentiality and full workspace gates pass;
- documentation records implementation evidence without duplicating canonical design text.
