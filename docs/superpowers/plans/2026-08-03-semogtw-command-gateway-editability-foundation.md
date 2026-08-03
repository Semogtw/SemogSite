# Semogtw Command Gateway and Editability Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce one framework-free command path for owner UI, future MCP clients and internal jobs, with strict schemas, resource/risk metadata, durable idempotency and machine-checked editability coverage.

**Architecture:** Add `@semogtw/application` between transport adapters and existing domain services. A registry validates and prepares commands; an injected policy decides the disposition; SQLite composition executes pilot commands and command receipts atomically. Existing browser mutations are migrated incrementally, beginning with attention lifecycle and stage completion, while domain services remain canonical for business rules.

**Tech Stack:** Node.js 22, TypeScript strict mode, Zod, Vitest, SQLite/Drizzle with `better-sqlite3`, TanStack Start, pnpm workspaces, existing Semogtw domain/database packages.

## Global Constraints

- Implement from the newest consolidated branch containing `2026-08-03-semogtw-unified-editability-agent-control-design.md`.
- Reconcile migration numbering before code. This plan currently reserves `0017_command_core.sql` after planned migrations `0014`–`0016`.
- `@semogtw/application` must not import React, TanStack, Hono, Drizzle, SQLite, `better-sqlite3`, MCP SDK, filesystem, shell or host-specific runtime APIs.
- Domain services continue to own business invariants and domain audit/event construction.
- UI, MCP and jobs must never reimplement command business rules.
- The server resolves resources and calculates risk; caller-provided labels never reduce risk.
- All command IDs are stable lowercase dotted identifiers.
- All command inputs and outputs are strict, bounded and schema-validated.
- No command result contains secrets, unrestricted database rows, raw exceptions or raw provider payloads.
- Successful writes and their idempotency receipt must be committed atomically for migrated commands.
- Same principal + command + idempotency key + same payload returns the original result; changed payload returns conflict.
- High/critical execution remains disabled until the approvals plan is implemented.
- Remote MCP write exposure remains disabled until the existing read/OAuth gates and the later authorization plan pass.
- Public routes and DTOs remain independent from command/manifest/receipt state.
- Commit and push after each independently reviewable task.

---

## Planned file structure

```text
packages/application/
  package.json
  tsconfig.json
  src/index.ts
  src/commands/
    types.ts
    canonical-json.ts
    canonical-json.test.ts
    registry.ts
    registry.test.ts
    gateway.ts
    gateway.test.ts
    owner-browser-policy.ts
    owner-browser-policy.test.ts
    editability-manifest.ts
    editability-manifest.test.ts
  src/attention/
    transition-attention-command.ts
    transition-attention-command.test.ts
  src/roadmap/
    complete-stage-command.ts
    complete-stage-command.test.ts

packages/database/
  migrations/0017_command_core.sql
  src/schema/command-core.ts
  src/repositories/command-receipt-repository.ts
  src/repositories/command-receipt-repository.test.ts
  src/composition/devos-command-registry.ts
  src/composition/devos-command-gateway.ts
  src/composition/devos-command-gateway.test.ts

apps/web/src/server/
  devos-command-gateway.server.ts
  devos-entity-actions.ts
  devos-entity-actions.test.ts

scripts/
  check-editability-coverage.mjs
  check-editability-coverage.test.mjs

docs/architecture/
  EDITABILITY_COVERAGE.md

docs/testing/
  2026-08-03-command-gateway-editability-test-matrix.md

tests/e2e/
  command-gateway-owner-parity.spec.ts
```

Existing files migrated by this plan:

```text
apps/web/src/server/devos-attention-lifecycle.ts
apps/web/src/server/devos-stage-completion.ts
packages/database/src/repositories/attention-lifecycle-repository.ts
packages/database/src/repositories/stage-completion-repository.ts
package.json
vitest.workspace.ts
CHANGELOG.md
SECURITY.md
docs/DATA_MODEL.md
docs/ARCHITECTURE.md
```

---

### Task 1: Inventory current mutation surfaces and reserve migration 0017

**Files:**
- Create: `docs/architecture/EDITABILITY_COVERAGE.md`
- Create: `docs/testing/2026-08-03-command-gateway-editability-test-matrix.md`
- Modify: `docs/superpowers/plans/2026-08-03-semogtw-agent-editability-plan-stack.md`

**Interfaces:**
- Consumes: current server functions, API routes, repository write methods, audit actions and existing migration list.
- Produces: an exact mutation inventory and confirmed migration number used by every later task.

- [ ] **Step 1: Capture branch and migration state**

```bash
git fetch --all --prune
git status --short --branch
git rev-parse HEAD
ls packages/database/migrations | sort
rg -n "createServerFn\(\{ method: \"POST\"|\.post\(|transitionWithAudit|WithAudit\(" apps packages
rg -n "001[4-9]_|002[0-1]_" packages/database/migrations docs/superpowers
```

Expected: record the exact 40-character head, all write entry points and whether `0017_command_core.sql` remains unused. If numbering changed, update all unimplemented reservations before code.

- [ ] **Step 2: Build the initial coverage table**

Create `EDITABILITY_COVERAGE.md` with one row per observed mutation and these columns:

```text
Feature
Current UI entry
Current server handler
Current domain service
Audit action
Conflict strategy
Planned command ID
Risk floor
MCP exposure
Migration status
```

The first two pilot rows must be:

```text
Attention lifecycle | attention.resolve/dismiss | attention.transition | medium | later
Stage completion    | stage.complete            | roadmap.stages.complete | high | later
```

Use `unclassified` only while completing the same task; no `unclassified` row may remain at commit.

- [ ] **Step 3: Run the baseline**

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm build
```

Expected: record exact pass/fail/block results and counts. Do not copy historical counts.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/EDITABILITY_COVERAGE.md \
  docs/testing/2026-08-03-command-gateway-editability-test-matrix.md \
  docs/superpowers/plans/2026-08-03-semogtw-agent-editability-plan-stack.md
git commit -m "docs: inventory DevOS mutation coverage"
git push
```

---

### Task 2: Create the framework-free application package and canonical hashing

**Files:**
- Create: `packages/application/package.json`
- Create: `packages/application/tsconfig.json`
- Create: `packages/application/src/index.ts`
- Create: `packages/application/src/commands/types.ts`
- Create: `packages/application/src/commands/canonical-json.ts`
- Create: `packages/application/src/commands/canonical-json.test.ts`
- Modify: `vitest.workspace.ts`

**Interfaces:**

```ts
import type { z } from "zod";

export type CommandRisk = "low" | "medium" | "high" | "critical";

export type CommandDisposition =
  | "allow"
  | "confirm_in_client"
  | "prepare_approval"
  | "approve_in_devos"
  | "deny";

export type CommandPrincipal = {
  ownerId: string;
  kind:
    | "owner_browser"
    | "mcp_client"
    | "internal_job"
    | "development_executor";
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
  execute(
    context: CommandExecutionContext,
    input: Input,
  ): Promise<Output>;
};

export type CommandExecutionContext = {
  principal: CommandPrincipal;
  reason: string;
  correlationId: string;
  idempotencyKey: string;
  requestedAt: string;
};

export function canonicalizeJson(value: unknown): string;
export function sha256CanonicalJson(value: unknown): Promise<string>;
```

Package manifest:

```json
{
  "name": "@semogtw/application",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "@semogtw/domain": "workspace:*",
    "zod": "^3.24.0"
  }
}
```

- [ ] **Step 1: Write failing canonical JSON tests**

```ts
import { describe, expect, it } from "vitest";
import { canonicalizeJson, sha256CanonicalJson } from "./canonical-json";

describe("canonicalizeJson", () => {
  it("sorts object keys recursively without reordering arrays", () => {
    expect(
      canonicalizeJson({ z: 1, a: { y: 2, b: 3 }, list: [3, 1] }),
    ).toBe('{"a":{"b":3,"y":2},"list":[3,1],"z":1}');
  });

  it("rejects undefined, bigint, functions and non-finite numbers", () => {
    expect(() => canonicalizeJson({ value: undefined })).toThrow(
      "NON_CANONICAL_JSON_VALUE",
    );
    expect(() => canonicalizeJson(Number.NaN)).toThrow(
      "NON_CANONICAL_JSON_VALUE",
    );
  });

  it("produces the same digest for equivalent key order", async () => {
    expect(await sha256CanonicalJson({ b: 2, a: 1 })).toBe(
      await sha256CanonicalJson({ a: 1, b: 2 }),
    );
  });
});
```

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/application test
```

Expected: FAIL because the package/module does not exist.

- [ ] **Step 3: Implement package scaffolding and canonical JSON**

Use Web Crypto `crypto.subtle.digest("SHA-256", ...)`, which is available in Node 22 and compatible with framework-free code. Return lowercase hex. Do not import `node:crypto` so the package remains portable.

- [ ] **Step 4: Run package checks**

```bash
pnpm install --lockfile-only
pnpm --filter @semogtw/application test
pnpm --filter @semogtw/application typecheck
pnpm check:boundaries
```

Expected: PASS and a lockfile update only for the workspace package/dependency edge.

- [ ] **Step 5: Commit**

```bash
git add packages/application vitest.workspace.ts pnpm-lock.yaml
git commit -m "feat: add framework-free command application package"
git push
```

---

### Task 3: Implement command registry and duplicate-proof definitions

**Files:**
- Create: `packages/application/src/commands/registry.ts`
- Create: `packages/application/src/commands/registry.test.ts`
- Modify: `packages/application/src/index.ts`

**Interfaces:**

```ts
export type AnyCommandDefinition = CommandDefinition<unknown, unknown>;

export class CommandRegistry {
  constructor(definitions: readonly AnyCommandDefinition[]);
  get(commandId: string): AnyCommandDefinition | null;
  list(): readonly {
    id: string;
    version: number;
    domain: string;
    capability: string;
    resourceKind: string;
    staticRiskFloor: CommandRisk;
    batchable: boolean;
    supportsCompensation: boolean;
  }[];
}
```

Registry invariants:

- command ID regex: `^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$`;
- version is positive integer;
- IDs are unique;
- capability and resource kind are non-empty and bounded to 120 characters;
- dynamic risk may only stay at or increase above the static floor;
- metadata list does not expose Zod internals or handlers.

- [ ] **Step 1: Write failing registry tests**

Use a local fake definition and assert successful lookup, stable sorted listing, duplicate rejection, invalid ID rejection and dynamic risk downgrade rejection through the exported `assertRiskAtLeastFloor()` helper.

```ts
expect(() => new CommandRegistry([definition, definition])).toThrow(
  "DUPLICATE_COMMAND_ID",
);
expect(() => assertRiskAtLeastFloor("high", "medium")).toThrow(
  "RISK_BELOW_STATIC_FLOOR",
);
```

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/application exec vitest run src/commands/registry.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement registry and risk ordering**

Use this order:

```ts
const riskRank: Readonly<Record<CommandRisk, number>> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};
```

- [ ] **Step 4: Run tests and commit**

```bash
pnpm --filter @semogtw/application exec vitest run src/commands/registry.test.ts
pnpm --filter @semogtw/application typecheck
git add packages/application/src
git commit -m "feat: add canonical command registry"
git push
```

---

### Task 4: Implement gateway preparation and owner-browser policy

**Files:**
- Create: `packages/application/src/commands/gateway.ts`
- Create: `packages/application/src/commands/gateway.test.ts`
- Create: `packages/application/src/commands/owner-browser-policy.ts`
- Create: `packages/application/src/commands/owner-browser-policy.test.ts`
- Modify: `packages/application/src/index.ts`

**Interfaces:**

```ts
export type CommandPolicyInput = {
  definition: AnyCommandDefinition;
  principal: CommandPrincipal;
  resource: CommandResource;
  risk: CommandRisk;
  confirmation: CommandConfirmation;
};

export type CommandPolicyDecision = {
  disposition: CommandDisposition;
  reasonCode: string;
};

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

export type CommandGatewayResult =
  | { status: "executed"; data: unknown; auditId: string | null }
  | { status: "confirmation_required"; code: string }
  | { status: "approval_required"; code: string; approvalId?: string }
  | { status: "conflict"; code: string; currentVersion?: number }
  | { status: "denied"; code: string }
  | { status: "failed"; code: string };

export class CommandGateway {
  constructor(
    registry: CommandRegistry,
    policy: CommandPolicy,
    execution: CommandExecutionPort,
  );
  execute(envelope: CommandEnvelope<unknown>): Promise<CommandGatewayResult>;
}

export class OwnerBrowserCommandPolicy implements CommandPolicy {
  evaluate(input: CommandPolicyInput): Promise<CommandPolicyDecision>;
}
```

Owner-browser phase-A policy:

```text
non-owner-browser principal → deny / PRINCIPAL_NOT_SUPPORTED
low + authenticated owner   → allow
medium + owner_ui confirmed → allow
medium without confirmation → confirm_in_client
high                        → prepare_approval
critical                    → approve_in_devos
```

The last two dispositions do not execute in this plan because approval storage does not yet exist.

- [ ] **Step 1: Write failing policy tests**

```ts
it("requires explicit owner UI confirmation for medium risk", async () => {
  const decision = await policy.evaluate({
    definition,
    principal: ownerPrincipal,
    resource,
    risk: "medium",
    confirmation: { kind: "none" },
  });
  expect(decision).toEqual({
    disposition: "confirm_in_client",
    reasonCode: "OWNER_CONFIRMATION_REQUIRED",
  });
});
```

Also test that a caller cannot supply `risk: low`; the gateway computes risk from the definition after parsing and current-state loading. Phase A passes `currentState = null`; state-aware escalation is introduced command by command.

- [ ] **Step 2: Write failing gateway tests**

Cover unknown command, invalid input, invalid UUID/correlation/timestamp envelope fields, risk floor, resource resolution before policy, denied execution not calling the execution port, high/critical not executing, output schema rejection and sanitized stable codes.

- [ ] **Step 3: Run and verify failure**

```bash
pnpm --filter @semogtw/application exec vitest run src/commands/gateway.test.ts src/commands/owner-browser-policy.test.ts
```

Expected: FAIL.

- [ ] **Step 4: Implement policy and gateway**

Validation order:

```text
1. bounded envelope metadata
2. registry lookup
3. input schema parse
4. resource resolution
5. command risk classification + floor assertion
6. canonical payload hash
7. policy evaluation
8. disposition mapping
9. execution port call only for allow
10. output schema parse
```

Never include Zod issue input values in returned/logged errors.

- [ ] **Step 5: Run tests and commit**

```bash
pnpm --filter @semogtw/application exec vitest run src/commands/gateway.test.ts src/commands/owner-browser-policy.test.ts
pnpm --filter @semogtw/application typecheck
git add packages/application/src
git commit -m "feat: add command gateway and owner policy"
git push
```

---

### Task 5: Add migration 0017 and durable command receipts

**Files:**
- Create: `packages/database/migrations/0017_command_core.sql`
- Create: `packages/database/src/schema/command-core.ts`
- Create: `packages/database/src/repositories/command-receipt-repository.ts`
- Create: `packages/database/src/repositories/command-receipt-repository.test.ts`
- Modify: `packages/database/src/schema/index.ts`
- Modify: `packages/database/src/index.ts`
- Modify: migration verification/backup tests following the current repository convention.

**Schema:**

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

CREATE INDEX command_receipts_expires_at_idx
  ON command_receipts (expires_at);
CREATE INDEX command_receipts_correlation_id_idx
  ON command_receipts (correlation_id);
```

Rules:

- `principal_key` is a server-derived opaque stable key such as `owner:<ownerId>` or later `client:<clientId>`;
- no raw command input, token, secret, provider content or private document body is stored;
- `result_json` is a bounded allowlisted command output, maximum 64 KiB;
- failed receipts store only stable error code and no raw exception;
- running receipts older than the configured lease may be recovered as failed with `COMMAND_EXECUTION_LEASE_EXPIRED`, never blindly rerun without command-specific safety review;
- retention/expiry cleanup is explicit and audited operational maintenance.

**Repository interface:**

```ts
export type CommandReceiptClaim =
  | { kind: "claimed"; receiptId: string }
  | { kind: "replay"; resultJson: string; auditId: string | null }
  | { kind: "in_progress" }
  | { kind: "payload_conflict" };

export interface CommandReceiptRepository {
  claim(input: {
    receiptId: string;
    principalKey: string;
    commandId: string;
    commandVersion: number;
    idempotencyKey: string;
    payloadSha256: string;
    correlationId: string;
    now: string;
    expiresAt: string;
  }): CommandReceiptClaim;
  complete(input: {
    receiptId: string;
    resultJson: string;
    resultSha256: string;
    auditId: string | null;
    completedAt: string;
  }): void;
  fail(input: {
    receiptId: string;
    stableErrorCode: string;
    completedAt: string;
  }): void;
}
```

- [ ] **Step 1: Write failing migration/repository tests**

Prove:

- migration applies twice through the migration runner;
- unique key prevents duplicate active execution;
- same payload replays the original result;
- changed payload returns conflict;
- 64 KiB result bound;
- no raw input column exists;
- rollback removes a claimed receipt when the surrounding transaction fails;
- backup/restore preserves completed receipts and constraints.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/database exec vitest run src/repositories/command-receipt-repository.test.ts src/migrations.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement schema and synchronous SQLite repository**

Use the same database handle/transaction supplied by the command execution composition. Do not open a second connection inside the repository.

- [ ] **Step 4: Run database tests**

```bash
pnpm --filter @semogtw/database exec vitest run src/repositories/command-receipt-repository.test.ts src/migrations.test.ts src/backup/sqlite-backup.test.ts
pnpm --filter @semogtw/database typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/database/migrations/0017_command_core.sql packages/database/src
git commit -m "feat: add durable command receipts"
git push
```

---

### Task 6: Register `attention.transition` as the first canonical command

**Files:**
- Create: `packages/application/src/attention/transition-attention-command.ts`
- Create: `packages/application/src/attention/transition-attention-command.test.ts`
- Modify: `packages/application/src/index.ts`
- Modify: `packages/database/src/repositories/attention-lifecycle-repository.ts`
- Modify: its repository tests.
- Create: `packages/database/src/composition/devos-command-registry.ts`

**Interfaces:**

```ts
export const TransitionAttentionInputSchema = z.object({
  attentionId: z.string().trim().min(1).max(200),
  targetStatus: z.enum(["resolved", "dismissed"]),
  reason: z.string().trim().min(1).max(500),
});

export const TransitionAttentionOutputSchema = z.object({
  attentionId: z.string().min(1).max(200),
  status: z.enum(["resolved", "dismissed"]),
  auditId: z.string().uuid(),
});

export function createTransitionAttentionCommand(deps: {
  service: AttentionLifecycleService;
}): CommandDefinition<
  z.infer<typeof TransitionAttentionInputSchema>,
  z.infer<typeof TransitionAttentionOutputSchema>
>;
```

Metadata:

```text
id: attention.transition
version: 1
domain: attention
capability: attention.write
resourceKind: attention_item
staticRiskFloor: medium
batchable: true
supportsCompensation: false
```

Resource:

```ts
{
  kind: "attention_item",
  id: input.attentionId,
  parentRefs: [],
}
```

Execution maps the gateway context to the existing domain service context. Confirmation is handled by policy/gateway, so the command sets the domain service's legacy `confirmed: true` only after the policy returned `allow`.

- [ ] **Step 1: Write failing command tests**

Test metadata, strict schema, resolved resource, medium floor, resolve/dismiss action mapping, output sanitization and domain conflict mapping.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/application exec vitest run src/attention/transition-attention-command.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the command adapter**

Do not move validation/business transitions out of `AttentionLifecycleService`; the command only adapts canonical input/context/result.

- [ ] **Step 4: Make the pilot repository transaction-bindable**

Add a constructor/factory accepting the transaction-scoped Drizzle/better-sqlite handle already used by the existing repository. Preserve current direct-service tests.

- [ ] **Step 5: Add the command to the database composition registry**

`createDevOSCommandRegistry(transaction)` constructs the domain service/repository bound to the supplied transaction and returns a registry containing `attention.transition`.

- [ ] **Step 6: Run tests and commit**

```bash
pnpm --filter @semogtw/application exec vitest run src/attention/transition-attention-command.test.ts
pnpm --filter @semogtw/database test -- attention-lifecycle-repository.test.ts
pnpm check:boundaries
git add packages/application/src packages/database/src
git commit -m "feat: register attention transition command"
git push
```

---

### Task 7: Implement atomic SQLite command execution composition

**Files:**
- Create: `packages/database/src/composition/devos-command-gateway.ts`
- Create: `packages/database/src/composition/devos-command-gateway.test.ts`
- Modify: `packages/database/src/index.ts`

**Interfaces:**

```ts
export function createSqliteDevOSCommandGateway(input: {
  database: SemogtwDatabase;
  policy: CommandPolicy;
  now: () => string;
  randomUUID: () => string;
}): CommandGateway;
```

Execution algorithm inside one SQLite transaction:

```text
1. derive principal key server-side
2. claim receipt
3. replay/conflict/in-progress short-circuit
4. construct transaction-bound registry/handler
5. execute domain command
6. validate bounded output
7. serialize/hash result
8. finalize receipt
9. commit domain mutation + domain audit/event + receipt together
```

Stable mappings:

```text
receipt payload conflict → conflict / IDEMPOTENCY_PAYLOAD_CONFLICT
receipt running          → conflict / COMMAND_ALREADY_RUNNING
domain conflict          → conflict / COMMAND_TARGET_CHANGED
domain not found         → failed / COMMAND_TARGET_NOT_FOUND
validation               → failed / COMMAND_VALIDATION_FAILED
unexpected exception     → failed / COMMAND_EXECUTION_FAILED
```

Unexpected exceptions are logged only by the outer host adapter with correlation ID; the returned result remains stable/sanitized.

- [ ] **Step 1: Write failing integration tests**

Prove:

- attention row, audit row and receipt commit together;
- forced receipt-finalization failure rolls back attention/audit mutation;
- forced domain failure leaves a stable failed receipt only when no domain mutation occurred;
- same key/same payload replays without a second audit row;
- same key/changed payload conflicts;
- denied/confirmation-required commands create no execution receipt;
- high/critical commands do not execute.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/database exec vitest run src/composition/devos-command-gateway.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement the composition**

Use a transaction-scoped command registry. No command handler may hold a repository created from the outer non-transaction handle.

- [ ] **Step 4: Run integration/type checks**

```bash
pnpm --filter @semogtw/database exec vitest run src/composition/devos-command-gateway.test.ts
pnpm --filter @semogtw/database typecheck
pnpm --filter @semogtw/application typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/database/src/composition packages/database/src/index.ts
git commit -m "feat: execute DevOS commands atomically"
git push
```

---

### Task 8: Migrate the attention browser mutation to the gateway

**Files:**
- Create: `apps/web/src/server/devos-command-gateway.server.ts`
- Create: its focused tests.
- Modify: `apps/web/src/server/devos-attention-lifecycle.ts`
- Modify: existing attention server/component tests.

**Interfaces:**

```ts
export async function getOwnerBrowserCommandGateway(input: {
  ownerId: string;
  sessionId: string;
}): Promise<CommandGateway | null>;
```

The existing `transitionAttentionFn` keeps its public browser input for compatibility but constructs:

```ts
{
  commandId: "attention.transition",
  input: {
    attentionId: data.attentionId,
    targetStatus: data.targetStatus,
    reason: data.reason,
  },
  principal: {
    ownerId: owner.id,
    kind: "owner_browser",
    sessionId: owner.sessionId,
    clientId: null,
    declaredProvider: null,
    declaredModel: null,
    grantIds: [],
  },
  idempotencyKey: data.idempotencyKey,
  reason: data.reason,
  expectedState: { strategy: "none" },
  confirmation: { kind: "owner_ui", confirmed: true },
  correlationId: crypto.randomUUID(),
  requestedAt: new Date().toISOString(),
}
```

Add `idempotencyKey: z.string().uuid()` to the server validator and browser form. Do not accept principal fields or command ID from the browser.

- [ ] **Step 1: Write failing web tests**

Test CSRF/owner resolution before database access, server-owned command/principal, idempotency replay, payload conflict and unchanged Portuguese success/error copy.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/web exec vitest run src/server/devos-command-gateway.server.test.ts src/server/devos-attention-lifecycle.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement composition and handler migration**

Delete direct `new AttentionLifecycleService(new Sqlite...)` construction from the web handler. The service remains instantiated only inside command composition.

- [ ] **Step 4: Run focused tests/typecheck**

```bash
pnpm --filter @semogtw/web exec vitest run src/server/devos-command-gateway.server.test.ts src/server/devos-attention-lifecycle.test.ts
pnpm --filter @semogtw/web typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/server apps/web/src/components/devos
git commit -m "refactor: route attention writes through command gateway"
git push
```

---

### Task 9: Register and migrate `roadmap.stages.complete`

**Files:**
- Create: `packages/application/src/roadmap/complete-stage-command.ts`
- Create: `packages/application/src/roadmap/complete-stage-command.test.ts`
- Modify: `packages/application/src/index.ts`
- Modify: `packages/database/src/repositories/stage-completion-repository.ts`
- Modify: `packages/database/src/composition/devos-command-registry.ts`
- Modify: `apps/web/src/server/devos-stage-completion.ts`
- Modify: `apps/web/src/components/devos/stage-completion-form.tsx`
- Modify: focused tests.

**Command metadata:**

```text
id: roadmap.stages.complete
version: 1
domain: roadmap
capability: roadmap.write
resourceKind: stage
staticRiskFloor: high
batchable: false
supportsCompensation: true
```

Dynamic risk:

- ordinary stage completion stays `high` because it changes derived project progress and completion evidence;
- a future security/auth/deployment stage may escalate to `critical` through current-state classification;
- Phase A policy returns `prepare_approval`, so the existing browser completion must not be switched until Plan 3 approvals exist, unless the owner-browser policy explicitly preserves the current existing confirmation behavior under a temporary documented compatibility rule.

This task therefore has two sub-phases:

```text
9A register/test command without changing production handler
9B migrate handler only after approvals plan provides an executable high-risk path
```

- [ ] **Step 1: Write failing command tests**

Test input/output/resource mapping, high floor, compensation metadata and no execution when the owner-browser policy returns `prepare_approval`.

- [ ] **Step 2: Implement and register the command**

Reuse `StageCompletionService`; do not duplicate evidence/completion invariants.

- [ ] **Step 3: Run command/database tests**

```bash
pnpm --filter @semogtw/application exec vitest run src/roadmap/complete-stage-command.test.ts
pnpm --filter @semogtw/database test -- stage-completion-repository.test.ts devos-command-gateway.test.ts
```

Expected: registry includes the command, but production browser handler still uses its existing safe path until approvals exist.

- [ ] **Step 4: Record the migration gate in coverage**

Set the row to:

```text
registered=true | browser_gateway=false | reason=awaiting_high_risk_approval_path
```

- [ ] **Step 5: Commit phase 9A**

```bash
git add packages/application/src packages/database/src docs/architecture/EDITABILITY_COVERAGE.md
git commit -m "feat: register guarded stage completion command"
git push
```

- [ ] **Step 6: After the approvals plan passes, write a failing browser approval-flow test**

The test must prove preview → approval → execution, stale target rejection and one final audit/receipt.

- [ ] **Step 7: Migrate the browser handler and commit phase 9B**

```bash
git add apps/web/src/server/devos-stage-completion.ts \
  apps/web/src/components/devos/stage-completion-form.tsx \
  docs/architecture/EDITABILITY_COVERAGE.md
git commit -m "refactor: route stage completion through approvals"
git push
```

---

### Task 10: Add editability manifests and a static completeness guard

**Files:**
- Create: `packages/application/src/commands/editability-manifest.ts`
- Create: `packages/application/src/commands/editability-manifest.test.ts`
- Create: `scripts/check-editability-coverage.mjs`
- Create: `scripts/check-editability-coverage.test.mjs`
- Modify: `package.json`
- Modify: command/domain modules to export manifests.

**Interfaces:**

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

export function validateEditabilityManifests(input: {
  manifests: readonly EditabilityManifest[];
  registry: CommandRegistry;
}): readonly EditabilityCoverageError[];
```

The script imports a generated JSON-safe manifest module or runs a TypeScript build artifact; it must not parse arbitrary source with fragile regex for semantic validation. It may use `git ls-files` only to detect unregistered server mutation files.

Coverage failures:

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

`not_yet` is allowed only with `implementationState: planned|partial` and a linked reason in `EDITABILITY_COVERAGE.md`.

- [ ] **Step 1: Write failing manifest tests**

Cover valid attention manifest and every failure code above.

- [ ] **Step 2: Write failing script fixture tests**

Create temporary fixture trees proving an unregistered `createServerFn({ method: "POST" })` fails and a manifest-referenced adapter passes.

- [ ] **Step 3: Run and verify failure**

```bash
pnpm --filter @semogtw/application exec vitest run src/commands/editability-manifest.test.ts
node scripts/check-editability-coverage.test.mjs
```

Expected: FAIL.

- [ ] **Step 4: Implement manifests and guardrail**

Initial manifests:

```text
attention.lifecycle
roadmap.stage-completion
```

Add root scripts:

```json
{
  "check:editability-coverage": "node scripts/check-editability-coverage.mjs"
}
```

Include it in `pnpm check` after boundary checks and before full typecheck/tests.

- [ ] **Step 5: Run guardrails and commit**

```bash
pnpm --filter @semogtw/application test
node scripts/check-editability-coverage.test.mjs
pnpm check:editability-coverage
pnpm check
git add packages/application/src scripts/check-editability-coverage* package.json docs/architecture/EDITABILITY_COVERAGE.md
git commit -m "ci: enforce DevOS editability coverage"
git push
```

---

### Task 11: Add owner-visible entity action discovery

**Files:**
- Create: `apps/web/src/server/devos-entity-actions.ts`
- Create: `apps/web/src/server/devos-entity-actions.test.ts`
- Modify: one authenticated attention/project page to display the pilot action metadata.
- Modify: existing DevOS styles.

**Interfaces:**

```ts
export type OwnerEntityAction = {
  commandId: string;
  labelPtBr: string;
  risk: CommandRisk;
  reversible: boolean;
  availability:
    | "available"
    | "confirmation_required"
    | "approval_required"
    | "planned";
};

export const getOwnerEntityActionsFn = createServerFn({ method: "GET" })
  .validator(
    z.object({
      resourceKind: z.string().min(1).max(120),
      resourceId: z.string().min(1).max(200),
    }),
  )
  .handler(/* owner-only filtered registry/manifests */);
```

This endpoint is not MCP discovery and does not expose hidden resources. It requires owner authentication before resource resolution.

- [ ] **Step 1: Write failing tests**

Test unauthenticated denial, exact resource filtering, Portuguese label mapping, high command shown as approval-required and no input/output schemas or handler internals in response.

- [ ] **Step 2: Run and verify failure**

```bash
pnpm --filter @semogtw/web exec vitest run src/server/devos-entity-actions.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement endpoint and minimal UI**

Render an `Ações disponíveis` disclosure, not a raw command table. Mark MCP availability as planned until Plan 2 passes.

- [ ] **Step 4: Run tests and commit**

```bash
pnpm --filter @semogtw/web exec vitest run src/server/devos-entity-actions.test.ts
pnpm --filter @semogtw/web typecheck
git add apps/web/src
git commit -m "feat: expose owner entity action discovery"
git push
```

---

### Task 12: Verify browser parity, idempotency, rollback and confidentiality

**Files:**
- Create: `tests/e2e/command-gateway-owner-parity.spec.ts`
- Modify: `docs/testing/2026-08-03-command-gateway-editability-test-matrix.md`
- Modify: `docs/architecture/EDITABILITY_COVERAGE.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `docs/DATA_MODEL.md`
- Modify: `SECURITY.md`
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: Tasks 1–11.
- Produces: exact-head evidence that the gateway preserves current UI behavior and provides the foundation for later MCP parity.

- [ ] **Step 1: Write the E2E flow**

The test must:

1. authenticate as owner;
2. create or use an open attention item;
3. resolve it through the existing UI;
4. intercept/replay the same browser command request with the same idempotency key;
5. verify one mutation, one domain audit row and one executed receipt;
6. replay the same key with changed target/reason and verify conflict;
7. verify action discovery lists `attention.transition`;
8. verify stage completion is registered but approval-gated;
9. sign out and verify command endpoints fail before database reads;
10. request anonymous public pages and assert no command ID, receipt, client/principal or private entity marker is present.

- [ ] **Step 2: Run focused and full gates**

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

Expected: record exact observed results against `git rev-parse HEAD`. Do not mark unavailable gates passed.

- [ ] **Step 3: Inspect the production build**

```bash
rg -n "command_receipts|attention\.transition|principal_key|idempotency_key" apps/web/dist
```

Expected: server bundle may contain server implementation identifiers; public browser assets and prerendered HTML must not contain private receipt rows, principal values or hidden command metadata.

- [ ] **Step 4: Scan plans/code for bypasses and placeholders**

```bash
rg -n "new (AttentionLifecycleService|StageCompletionService)|TODO|TBD|implement later|fill in details" \
  apps/web/src/server packages/application packages/database/src/composition \
  docs/superpowers/plans/2026-08-03-semogtw-command-gateway-editability-foundation.md
```

Expected: migrated attention web code has no direct service construction; registered-but-gated stage code is explicitly documented; no placeholder remains.

- [ ] **Step 5: Update documentation by reference, then commit**

Document package boundaries, migration/tables, observed pilot coverage and exact commands. Link to the unified specification rather than copying its full risk model.

```bash
git add tests/e2e/command-gateway-owner-parity.spec.ts \
  docs/testing/2026-08-03-command-gateway-editability-test-matrix.md \
  docs/architecture/EDITABILITY_COVERAGE.md docs/ARCHITECTURE.md \
  docs/DATA_MODEL.md SECURITY.md CHANGELOG.md
git commit -m "test: verify command gateway editability foundation"
git push
```

## Acceptance criteria

This plan is complete only when:

- `@semogtw/application` is framework/persistence/provider neutral;
- command IDs/versions/schemas/resources/risks are registered and machine validated;
- risk cannot fall below the static floor;
- owner-browser low/medium policy behaves deterministically;
- high/critical commands cannot execute without later approval support;
- durable idempotency receipts are bounded and contain no raw inputs/secrets;
- pilot mutation + domain audit/event + receipt commit atomically;
- replay/conflict/concurrency behavior is tested;
- attention browser behavior uses the gateway without duplicate business rules;
- stage completion is registered and remains safely gated until approvals exist;
- editability manifests and CI guardrails detect untracked mutations;
- owner action discovery is filtered and does not expose raw schemas/hidden resources;
- public confidentiality and full workspace gates pass;
- documentation records implementation evidence without duplicating canonical design text.
