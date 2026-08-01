# 2026-08-01 — Cooperative run ledger

## Added

- provider-neutral cooperative run snapshot and lifecycle state machine;
- explicit running, blocked, completed, failed and cancelled states;
- deterministic read-time freshness without automatic lifecycle mutation;
- registration service with server-owned timestamps and immutable event proposal;
- evidence-rich checkpoint service preserving commits, test status/summary, blockers and next step;
- six-kind owner command queue with allowlisted payloads and expiration;
- command acknowledge/complete/reject lifecycle separate from command creation;
- provider-neutral bounded FIFO inbox for queued, non-expired commands;
- additive migration `0005_cooperative_run_ledger.sql`;
- Drizzle schema for runs, events, checkpoints and commands;
- SQLite repositories using immediate transactions, optimistic concurrency and append-only events;
- owner-only run list/detail read model with bounded history;
- derived command queue availability without rewriting persisted status;
- owner-only `/devos/runs` and `/devos/runs/:runId` routes;
- run registration, lifecycle, rich checkpoint and command creation forms;
- responsive run cards, histories and forms;
- DevOS navigation entries for cooperative executions;
- agent participation/fallback protocol;
- run-ledger architecture/reference, threat model, test matrix, deployment gates and runbook.

## Security and integrity hardening

- owner session resolved at both route and server-function boundaries;
- CSRF and literal confirmation required for browser mutations;
- client UUID retained across retries;
- entity/event/correlation IDs derived server-side;
- stable-intent idempotency for delayed registration/command retries;
- compare-and-swap protection for run and command transitions;
- entity/event/checkpoint writes share immediate transactions;
- command transitions cannot change original kind, payload, summary, owner, correlation, enqueue time or expiration;
- command payloads reject arbitrary fields, credential-like keys and values above 16 KiB;
- checkpoint commits are normalized, deduplicated and bounded;
- malformed historical JSON is surfaced safely;
- agent inbox fails closed on malformed command payloads;
- browser cannot acknowledge or complete commands on behalf of an agent;
- remote agent/MCP transport remains absent and blocked.

## Fixed during implementation review

- cooperative run tables missing from the composed Drizzle schema export;
- incomplete domain/database barrel exports;
- migration and backup expectations stopping at `0004`;
- registration retries conflicting only because server timestamps changed;
- command retries generating new IDs/correlation or conflicting only because timestamps changed;
- generic lifecycle “checkpoint” not creating evidence-rich checkpoint records;
- command transition persistence not independently enforcing immutable fields/lifecycle pairs;
- queued command expiration being indistinguishable from persisted status;
- responsive run CSS initially using noncanonical token names;
- owner command detail limits differing from domain policy;
- private UI wording that could blur reported state and live telemetry.

## Committed specifications

- run state and freshness invariants;
- registration/lifecycle/checkpoint/command/inbox domain behavior;
- migration `0001`–`0005` and backup expectations;
- SQLite atomicity, idempotency, conflict and rollback behavior;
- delayed retry deduplication;
- immutable command transition fields;
- malformed historical data handling;
- derived queue availability;
- FIFO non-expired command polling;
- owner-only web/server composition and responsive flows.

## Verification state

The new suites are committed specifications, not passage evidence for the current HEAD. A current dependency-complete repository snapshot was not available in the connected shell, and GitHub Actions were not added as a workaround.

Required before ready-for-review:

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm --filter @semogtw/domain typecheck
pnpm --filter @semogtw/domain test
pnpm --filter @semogtw/database typecheck
pnpm --filter @semogtw/database test
pnpm --filter @semogtw/web typecheck
pnpm check
pnpm build
```

Then run migration/backup, authenticated owner workflow, anonymous confidentiality, keyboard/360 px and deployment/rollback gates.

## Deliberately not included

- live ChatGPT/Codex telemetry;
- OpenAI account integration;
- prompt transcript or hidden reasoning storage;
- direct process supervision;
- instant message injection into ChatGPT;
- authenticated remote agent command polling;
- remote MCP writes/listener;
- automatic stale-run cancellation;
- public run data.
