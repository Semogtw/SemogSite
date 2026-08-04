# Command Gateway implementation evidence

## Handoff

```text
Plan and task:
  2026-08-03-semogtw-command-gateway-editability-foundation.md
  Tasks 1–11 implemented; Task 12 code/docs implemented with execution gates pending.

Branch and base SHA:
  branch: develop/command-gateway-foundation-implementation
  PR: #26
  base branch: develop/learning-growth-core-implementation
  base SHA: 4e3a21adec8c5e1e8ad6a2d70a1a31683c07c8dc

Latest code/documentation head before this evidence commit:
  91206ad54f1d15a7178a5fccbad793736593923f

Tests actually executed:
  none in the official repository runtime

Observed results/counts:
  GitHub reports PR #26 open, draft and mergeable.
  No commit status/check was present on the previously queried head.
  No exact-head test, typecheck, build, backup or Playwright output was observed.

Unavailable or failing gates:
  project checkout unavailable
  Node 22/pnpm runtime unavailable
  GitHub workflow dispatch unavailable
  pnpm-lock.yaml not regenerated

Security/privacy implications:
  no MCP writes
  no high/critical execution
  no generic mutation tool
  Attention medium-risk mutation uses server-owned command identity and durable receipts
  corrupt succeeded/failed receipts fail closed and never invoke the runner
  Stage completion remains approval-gated and has no Gateway runner
  every current private createServerFn POST file is required to have an explicit catalog classification
  owner action discovery returns bounded human metadata only

Documentation updated:
  docs/architecture/EDITABILITY_COVERAGE.md
  docs/testing/2026-08-04-command-gateway-coverage.md
  docs/testing/2026-08-04-command-gateway-test-matrix.md
  DATA_MODEL.md
  SECURITY.md
  this evidence record

Known blockers:
  regenerate and review pnpm-lock.yaml
  execute exact-head tests/typechecks/build/backup/Playwright
  verify the exact-head POST inventory through check:editability-coverage
  implement immutable approvals before Stage migration

Exact next action:
  run pnpm install --lockfile-only under Node 22/pnpm 10.14, review and commit
  the importer/dependency diff, then execute the focused and repository-wide gates.
```

## Implemented application foundation

- `@semogtw/application` package included in the Vitest workspace;
- strict command envelopes, target/context contracts and JSON value types;
- canonical JSON rejecting cycles, sparse arrays, non-finite numbers, accessors, symbols, functions, bigint and special prototypes;
- SHA-256 through Web Crypto rather than Node runtime imports;
- stable versioned command registry with bounded metadata and deny-by-default lookup;
- envelope/context/target validation before registry lookup;
- owner-browser policy with monotonic risk floors;
- asynchronous command preparation with payload, expected-state and semantic request hashes;
- receipt claim/success/failure contracts without raw payloads;
- editability manifests loaded from a shared JSON catalog;
- resource-filtered owner action discovery.

## Implemented durable execution

Migrations:

```text
0017_command_core.sql
0017a_command_receipt_semantic_key.sql
```

The SQLite implementation includes:

- semantic idempotency independent of resource ID;
- repository lookup aligned to the same principal/command/version/key columns as the unique index;
- exact replay and changed-payload/resource conflict;
- bounded canonical success summaries and stable failure codes;
- canonical SHA-256 validation before success finalization;
- full integrity validation before replaying either final status;
- malformed restored/adulterated receipts mapped to `COMMAND_RECEIPT_RESULT_INVALID` without runner execution;
- explicit lease recovery preserving original receipt/resource/correlation identity;
- immutable final receipts;
- backup coverage updated for both migrations;
- synchronous transaction-bound runners only;
- domain state, audit and success receipt finalized atomically;
- mutation/audit rollback before stable failure finalization;
- audit resource/correlation validation before success.

Focused tests registered for this hardening include:

```text
sqlite-command-executor-replay-integrity.test.ts
sqlite-command-executor-failed-replay-integrity.test.ts
command-receipt-canonical-finalization.test.ts
command-receipt-semantic-key.test.ts
```

These tests are present but were not executed in this session.

## Attention pilot

`attention.transition` is registered and enabled as a medium-risk command.

The implementation:

- uses strict payload parsing and resource binding;
- shares pure validation/planning with `AttentionLifecycleService`;
- uses the existing SQLite Attention mapping through a synchronous transaction path;
- requires owner confirmation before receipt creation;
- binds optimistic concurrency to the Today projection's canonical `updatedAt`;
- creates command identity, capability, resource kind, principal and correlation on the server;
- stores a stable per-attempt UUID in the browser and renews it only after success;
- maps internal errors to stable Portuguese UI messages;
- exposes human action metadata through an owner-only disclosure.

## Stage completion

`roadmap.stages.complete` is registered with:

```text
capability: roadmap.write
resource: stage
risk: high
confirmation: approve_in_devos
conflict: exact_snapshot
execution: registered_blocked
```

There is no Gateway runner. The existing browser form remains on its legacy service path until immutable approval storage, recent authentication and stale-safe execution are implemented. Client confirmation and client-supplied approval IDs cannot create a receipt or execute the command.

## Editability coverage

The shared catalog records commands, feature manifests, routes, adapters and every current private server POST surface.

The guardrail verifies:

- command source files;
- high/critical approval dispositions;
- unique features and command coverage;
- risk-summary parity;
- route existence;
- audit/conflict metadata;
- adapter required/forbidden markers;
- no false `complete` claim while MCP remains unavailable;
- every `createServerFn({ method: "POST" })` file is cataloged;
- Gateway files map to manifest-backed adapters;
- legacy files retain non-empty coverage references;
- exclusions use only closed reasons;
- stale catalog entries that no longer contain POST fail the gate.

The catalog intentionally distinguishes:

```text
gateway
legacy_registered
excluded_noncanonical
```

`legacy_registered` is inventory/debt tracking, not a claim of UI/MCP parity.

The boundary guard scans runtime files in `packages/application` and rejects React, TanStack, Hono, persistence, MCP, UI and Node-runtime imports, including side-effect-only imports.

## Added E2E specification

`tests/e2e/command-gateway-owner-parity.spec.ts` covers:

- public confidentiality;
- anonymous redirects before private action metadata;
- owner Attention capture through the existing UI;
- action discovery with human labels and no command/schema exposure;
- Attention completion through the canonical Gateway;
- exact replay of the real captured TanStack request;
- changed reason with the same idempotency key producing conflict;
- direct inspection of the known E2E SQLite database for one resolved state, one audit and one succeeded receipt;
- updated Today queue after completion;
- Stage action shown as high-risk and planned.

The scenario is implemented but not executed. The exact TanStack request-body replay and SQLite read must be validated by the focused Playwright gate rather than inferred from static review.

## Mandatory remaining commands

```text
pnpm install --lockfile-only
pnpm install --frozen-lockfile
pnpm --filter @semogtw/application test
pnpm --filter @semogtw/application typecheck
pnpm --filter @semogtw/domain test
pnpm --filter @semogtw/domain typecheck
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/database typecheck
pnpm --filter @semogtw/web test
pnpm --filter @semogtw/web typecheck
pnpm check:editability-coverage
pnpm check:boundaries
pnpm check:public-confidentiality
pnpm check
pnpm build
pnpm exec playwright test tests/e2e/command-gateway-owner-parity.spec.ts
```

No command in this list is recorded as passed for the current head.
