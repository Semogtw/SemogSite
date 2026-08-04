# Editability Coverage and Command Gateway

## Purpose

The private DevOS must expose meaningful product state through guided owner interfaces and policy-controlled automation without creating a second mutation path. This document records the implemented coverage mechanism; the canonical product and security requirements remain in the approved unified-editability specification and implementation plan.

## Implemented command path

```text
owner UI
  -> authenticated server handler
  -> framework-free CommandGateway preparation
  -> strict command registry and owner-browser policy
  -> durable semantic receipt claim
  -> transaction-bound SQLite command runner
  -> canonical domain planner/service rule
  -> domain state + audit + receipt finalization in one transaction
```

The application package owns command identity, strict payload parsing, resource binding, static risk floors, policy dispositions, canonical JSON and Web Crypto hashes. It imports no React, TanStack, Hono, ORM, SQLite, MCP SDK, Node runtime, filesystem, shell or deployment implementation.

The database package owns SQLite receipts, lease recovery, transaction-bound execution, command runner composition and exact resource discovery. Infrastructure-specific cryptography used inside a SQLite transaction remains in this package rather than leaking into the application layer.

The web package owns owner-session and CSRF enforcement, human request schemas, Portuguese messages and guided forms. It never accepts command IDs, capabilities, principal identity or resource kinds from an ordinary mutation form.

## Durable receipts

Migrations:

```text
0017_command_core.sql
0017a_command_receipt_semantic_key.sql
```

A receipt stores bounded identity and execution metadata, request/result hashes, a bounded result summary or stable error code, correlation, lease and timestamps. It has no raw payload, cookie, token, password or secret column.

The semantic uniqueness boundary is:

```text
owner + actor kind + actor ID + client ID + command ID + command version + idempotency key
```

The resource is deliberately not part of that key. Reusing the same principal/command/key against another resource conflicts rather than creating a second receipt. The repository lookup uses the same columns as the incremental unique index instead of relying on a constraint exception after an attempted insert.

Expired in-progress leases are recovered explicitly. A recovered runner receives the original receipt ID, resource, principal and correlation; retry-supplied identity cannot alter the audit chain.

A final receipt is not trusted merely because its `status` says `succeeded` or `failed`. Before replay:

- success requires a canonical JSON object no larger than 4,000 UTF-8 bytes;
- the stored lowercase SHA-256 must match the exact canonical JSON bytes;
- success and failure column combinations must match their final state;
- malformed restored or adulterated rows fail closed as `COMMAND_RECEIPT_RESULT_INVALID`;
- the runner is never called to repair or reinterpret a corrupt final receipt.

Repository finalization applies the same canonical JSON and hash checks before changing an in-progress receipt to succeeded.

## Initial registry

### `attention.transition`

- version: `1`
- capability: `attention.write`
- resource: `attention_item`
- risk floor: `medium`
- confirmation: `confirm_in_client`
- conflict: `expected_timestamp`
- receipt: required
- undo: compensating command
- execution: enabled
- owner route: `/devos/today`

The Today projection carries the canonical Attention `updatedAt`. The browser sends only the human payload, observed timestamp, confirmation and a per-attempt UUID. The server constructs command identity, principal, target, correlation and capability. The transaction uses the Attention lifecycle planner shared with `AttentionLifecycleService`.

### `roadmap.stages.complete`

- version: `1`
- capability: `roadmap.write`
- resource: `stage`
- risk floor: `high`
- confirmation: `approve_in_devos`
- conflict: `exact_snapshot`
- receipt: required when execution becomes available
- undo: compensating command
- execution: `registered_blocked`
- owner route: `/devos/projects/$slug`

This command has no Gateway runner and its existing browser mutation has not been migrated. Owner confirmation or a client-supplied `approvalId` cannot lower its disposition. It remains blocked until immutable approvals, recent authentication, stale-state binding and approval execution exist.

## Shared editability catalog

`packages/application/src/editability-catalog.json` is the machine-readable source for:

- registered command metadata and human labels;
- feature manifests;
- owner routes;
- MCP strategy;
- risk summaries;
- conflict, undo and audit expectations;
- Gateway adapter state;
- every current private server file that registers a POST mutation.

Every mutation surface is classified as one of:

```text
gateway
legacy_registered
excluded_noncanonical
```

`legacy_registered` requires one or more coverage references and means only that the existing browser mutation has been inventoried for a later rollout. It does not claim Gateway parity, MCP exposure or completion.

`excluded_noncanonical` accepts only closed reasons such as authentication infrastructure, bounded evaluation or read preparation. An arbitrary bypass reason is rejected.

Application tests validate the catalog against the actual registry. `scripts/check-editability-coverage.mjs` validates the same catalog without executing TypeScript, verifies command/route/adapter files, recursively scans `apps/web/src/server`, and rejects:

- any new `createServerFn({ method: "POST" })` file absent from the catalog;
- stale catalog entries that no longer contain a POST;
- Gateway surfaces without a manifest-backed adapter;
- legacy entries without coverage references;
- unknown states or non-allowlisted exclusions.

Current implementation states are intentionally not `complete`:

- Attention lifecycle: `partial` because MCP exposure and a compensating command are not implemented.
- Roadmap stage completion: `planned` because the high-risk approval path is unavailable.

## Owner action discovery

The private action-discovery endpoint resolves the owner before storage access and then checks the exact canonical resource. Missing, unsupported, terminal, denied or unavailable resources all produce an empty list.

The response is bounded to:

```text
human label
risk
reversibility
availability
```

No input/output schema, capability grant, handler, payload, principal metadata or hidden-resource detail is returned. DevOS renders this as an “Ações disponíveis” disclosure, not a raw command table.

## Guardrails

The root `pnpm check` includes:

```text
pnpm check:editability-coverage
pnpm check:boundaries
```

The boundary check scans runtime files in `packages/application` and rejects framework, persistence, MCP, UI and Node-runtime imports, including side-effect-only imports. Canonical hashes use Web Crypto.

Package surfaces are explicit:

```text
@semogtw/application
@semogtw/domain/attention
@semogtw/database/commands
```

The focused Playwright scenario captures the real Attention server-function request, replays the same request, changes only the reason while retaining the same idempotency key, and inspects the known E2E SQLite database to require one state transition, one audit event and one succeeded receipt. This scenario is implemented but has not been executed on the current head.

## Deliberately unavailable capabilities

- remote MCP writes;
- generic mutation, SQL, shell, filesystem, Git or HTTP tools;
- high/critical execution without real DevOS approvals;
- client-selected principal, capability, handler or risk;
- arbitrary direct progress setters;
- production merge/deploy/rollback.

## Verification status

All tests and guardrails added by this branch remain unexecuted in the connected session. The environment has no project checkout with Node 22/pnpm and no workflow-dispatch capability. Static review is not a substitute for the exact-head test, typecheck, build, backup and Playwright gates.

`pnpm-lock.yaml` also requires regeneration with `pnpm install --lockfile-only` because this branch adds the `packages/application` workspace importer and `@semogtw/database -> @semogtw/application` dependency. Frozen installation must be expected to fail until that lockfile update is produced and reviewed.
