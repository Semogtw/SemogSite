# Learning Goals Core — Test Matrix

## Execution identity

```text
Plan: docs/superpowers/plans/2026-08-03-semogtw-learning-goals-core.md
Branch: develop/learning-growth-core-implementation
Base commit: b90df5934e17151e79d400ae1bcea4b430f2715c
Recorded at: 2026-08-04T00:24:00Z
```

## Baseline reconciliation

- The implementation branch is isolated from the approved documentation head of PR #23.
- The repository documents migrations `0001` through `0013` as implemented.
- `packages/database/migrations/0014_mcp_oauth.sql` is absent.
- `packages/database/migrations/0015_learning_goals.sql` is absent.
- No `packages/domain/src/growth` implementation exists at the base commit.
- The current Growth scope is therefore a new private domain implementation, not an extension of existing runtime code.
- Migration number `0015` remains reserved, but implementation must not claim remote MCP/OAuth readiness from the absence of `0014`; Growth itself remains provider-neutral and usable without remote MCP.

## Baseline commands

The following commands are required by the plan but could not be executed in this connector-only session before code changes:

| Gate | Status | Classification | Evidence |
| --- | --- | --- | --- |
| `pnpm install --frozen-lockfile` | not run | environment | No local process/runtime tool is exposed in this session. |
| `pnpm check:boundaries` | not run | environment | Awaiting CI or a local executor tied to the implementation SHA. |
| `pnpm check:public-confidentiality` | not run | environment | Awaiting CI or a local executor tied to the implementation SHA. |
| `pnpm --filter @semogtw/domain test` | not run | environment | Awaiting CI or a local executor tied to the implementation SHA. |
| `pnpm --filter @semogtw/database test` | not run | environment | Awaiting CI or a local executor tied to the implementation SHA. |
| `pnpm --filter @semogtw/web typecheck` | not run | environment | Awaiting CI or a local executor tied to the implementation SHA. |
| `pnpm --filter @semogtw/web build` | not run | environment | Awaiting CI or a local executor tied to the implementation SHA. |

No gate is recorded as passed without observed output. The first implementation PR must use repository CI when available and append exact run IDs, commit SHA, counts and failures here.

## Planned verification slices

### Domain contracts

- canonical status unions;
- title, slug, timestamp, weight and completion-mode validation;
- no framework/persistence/provider imports.

### Progress derivation

- binary and numeric checkpoint ratios;
- cancelled checkpoints excluded from denominator;
- waived checkpoints handled explicitly;
- no direct percentage input or persisted percentage field;
- deterministic two-decimal display rounding.

### Persistence

- additive migration `0015_learning_goals.sql`;
- foreign keys, lifecycle checks and append-only events;
- entity/event/global audit atomicity;
- backup/restore preserving canonical rows.

### Private UI and confidentiality

- owner authentication and CSRF before private reads/writes;
- idempotency and optimistic conflicts;
- no Growth data in anonymous HTML, DTOs, static output or indexing;
- usable 360 px layout.

## Update rule

Every verification update must record:

```text
Exact commit SHA
Command
Observed result and test count
CI run/job ID or local environment
Failure classification
Follow-up action
```
