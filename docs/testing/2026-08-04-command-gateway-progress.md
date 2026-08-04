# Command Gateway implementation evidence

## Handoff

```text
Plan and task:
  2026-08-03-semogtw-command-gateway-editability-foundation.md
  Tasks 1–11 implemented or partially implemented; Task 12 verification remains unexecuted.

Branch and base SHA:
  branch: develop/command-gateway-foundation-implementation
  PR: #26
  base branch: develop/learning-growth-core-implementation
  base SHA: 4e3a21adec8c5e1e8ad6a2d70a1a31683c07c8dc

Latest queried head before this evidence commit:
  f784e2c7f3d0856dbef4e38db3759f7355824733

Tests actually executed:
  none in the official repository runtime

Observed results/counts:
  GitHub reports PR #26 open, draft and mergeable.
  No exact-head test, typecheck, build or Playwright output was observed.

Unavailable or failing gates:
  project checkout unavailable
  Node 22/pnpm runtime unavailable
  GitHub workflow dispatch unavailable
  outbound raw.githubusercontent.com DNS unavailable
  pnpm-lock.yaml not regenerated

Security/privacy implications:
  no MCP writes
  no high/critical execution
  no generic mutation surface
  Attention medium-risk mutation uses server-owned command identity and durable receipts
  Stage completion remains approval-gated and has no Gateway runner
  owner action discovery returns bounded human metadata only

Documentation updated:
  docs/architecture/EDITABILITY_COVERAGE.md
  docs/testing/2026-08-04-command-gateway-test-matrix.md
  this evidence record

Known blockers:
  regenerate and review pnpm-lock.yaml
  execute exact-head tests/typechecks/build/Playwright
  implement immutable approvals before Stage migration

Exact next action:
  run pnpm install --lockfile-only under Node 22/pnpm 10.14, commit the lockfile,
  then execute the focused application/domain/database/web and guardrail gates.
```

## Implemented application foundation

- `@semogtw/application` package included in the Vitest workspace;
- strict command envelopes, target/context contracts and JSON value types;
- canonical JSON rejecting cycles, sparse arrays, non-finite numbers, accessors, symbols, functions, bigint and special prototypes;
- SHA-256 through Web Crypto rather than Node runtime imports;
- stable versioned command registry with bounded metadata and deny-by-default lookup;
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
- exact replay and changed-hash conflict;
- bounded success summaries and stable failure codes;
- explicit lease recovery preserving original receipt/correlation identity;
- immutable final receipts;
- verified backup coverage;
- synchronous transaction-bound runners only;
- domain state, audit and success receipt finalized atomically;
- mutation/audit rollback before stable failure finalization;
- audit resource/correlation validation before success.

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
risk: high
confirmation: approve_in_devos
conflict: exact_snapshot
execution: registered_blocked
```

There is no Gateway runner. The existing browser form remains on its legacy service path until immutable approval storage, recent authentication and stale-safe execution are implemented. Client confirmation and client-supplied approval IDs cannot create a receipt or execute the command.

## Editability coverage

The shared catalog records commands, feature manifests, routes and adapter state. The new guardrail verifies:

- command source files;
- high/critical approval dispositions;
- unique features and command coverage;
- risk-summary parity;
- route existence;
- audit/conflict metadata;
- adapter required/forbidden markers;
- unregistered Gateway adapters;
- no false `complete` claim while MCP remains unavailable.

The boundary guard now scans runtime files in `packages/application` and rejects React, TanStack, Hono, persistence, MCP, UI and Node-runtime imports.

## Added E2E specification

`tests/e2e/command-gateway-owner-parity.spec.ts` covers:

- public confidentiality;
- anonymous redirects before private action metadata;
- owner Attention capture through the existing UI;
- action discovery with human labels and no command/schema exposure;
- Attention completion through the canonical Gateway;
- updated Today queue after completion;
- Stage action shown as high-risk and planned.

The specification is implemented but not executed.

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
