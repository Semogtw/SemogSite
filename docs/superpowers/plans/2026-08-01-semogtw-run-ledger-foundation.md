# Semogtw cooperative run ledger foundation

**Parent plan:** [`2026-08-01-semogtw-chatgpt-execution-control-plane.md`](./2026-08-01-semogtw-chatgpt-execution-control-plane.md)

**Goal:** Establish provider-neutral run state, deterministic freshness, append-only events, SQLite persistence and an owner-only operational surface before remote MCP writes are introduced.

## Product boundary

The run ledger represents cooperative reports supplied by an agent, owner or approved adapter. It does not inspect ChatGPT conversations, hidden model state, background execution or machine processes automatically.

Initial implementation contains no:

- OpenAI API dependency;
- remote MCP write;
- scheduler/background worker;
- webhook;
- process supervision;
- direct command injection into ChatGPT;
- automatic cancellation or completion.

## Status model

Persisted lifecycle status:

```text
running ↔ blocked
running → completed | failed | cancelled
blocked → failed | cancelled
```

Terminal states are immutable.

`stale` is **not** a lifecycle status. Freshness is derived deterministically from `lastHeartbeatAt`, `staleAfterSeconds` and a supplied observation time:

```text
current | stale
```

Reading freshness never mutates the run.

## Run snapshot

The provider-neutral snapshot contains:

- stable run and optional project IDs;
- title;
- actor label and origin (`chatgpt`, `codex`, `manual`, `automation`, `other`);
- lifecycle status;
- optional phase and branch;
- integer progress from 0 to 100;
- current summary, blocker and next action;
- start, heartbeat, finish and update timestamps;
- bounded stale threshold.

It deliberately contains no prompt transcript, hidden chain of thought, token, cookie or arbitrary command body.

## Transition commands

- `heartbeat`: refresh activity and optionally update summary/phase/branch/next action;
- `checkpoint`: record meaningful progress without changing lifecycle status;
- `block`: move running → blocked with blocker and unlock action;
- `resume`: move blocked → running and clear blocker;
- `complete`: move running → completed at 100%;
- `fail`: move running/blocked → failed with a reason;
- `cancel`: move running/blocked → cancelled with explicit reason/confirmation in adapters.

Every successful transition produces:

- before/after snapshots;
- canonical event kind;
- occurred-at timestamp;
- a sanitized summary suitable for append-only persistence.

Repository adapters add stable IDs, actor identity, idempotency key and correlation ID.

## Owner command queue

Commands are cooperative pull records, not direct process control:

- `continue`;
- `pause`;
- `cancel`;
- `reprioritize`;
- `request_checkpoint`;
- `provide_context`.

Each kind has an allowlisted payload. Sensitive credential keys, arbitrary payload fields and oversized values are rejected before storage. A command can be acknowledged, completed or rejected; acknowledgement never implies application.

## Invariants

- all timestamps are valid UTC ISO strings;
- transition time cannot precede the current `updatedAt`;
- `expectedUpdatedAt` must match exactly after normalization;
- progress is an integer from 0 to 100 and never decreases;
- running requires a non-empty next action;
- blocked requires blocker plus next action;
- completed requires progress 100, summary and no blocker/next action;
- failed/cancelled require a reason and finish time;
- nonterminal states have no finish time;
- terminal states reject every later transition;
- stale thresholds are bounded from 5 minutes to 24 hours;
- heartbeat/checkpoint do not silently change lifecycle status;
- invalid/conflicting commands produce no proposed event;
- command transitions use optimistic status + `updated_at` matching;
- command/event and checkpoint/event writes share immediate transactions.

## Task 1: Pure domain state machine

- [x] Specify run snapshot, freshness and transition contracts.
- [x] Specify heartbeat/checkpoint, block/resume and terminal transitions.
- [x] Specify progress, timestamp and optimistic-concurrency validation.
- [x] Specify terminal immutability and deterministic stale boundary.
- [x] Implement without framework, storage, timer or runtime imports.
- [x] Export contracts from `@semogtw/domain`.

## Task 2: Registration service

- [x] Validate title, actor/origin, optional project/branch and stale threshold.
- [x] Create a running snapshot with server-owned timestamps.
- [x] Produce a `run.registered` event proposal.
- [x] Require stable run/event/idempotency/correlation IDs at the adapter context.

## Task 3: SQLite ledger

- [x] Add additive migration `0005_cooperative_run_ledger.sql` after `0004`.
- [x] Persist runs, immutable events, checkpoints and queued owner commands.
- [x] Use immediate transactions and optimistic `updated_at` matching.
- [x] Make registration, transition, checkpoint and command idempotency explicit.
- [x] Preserve existing development sessions/evidence rather than duplicating them into the new tables.
- [x] Include the run tables in the composed Drizzle schema and package barrels.
- [x] Update migration and backup expectations for `0005`.

## Task 4: Protected reads and UI

- [x] Add owner-only run list/detail read models.
- [x] Show lifecycle status and derived freshness separately.
- [x] Add bounded event history, checkpoint evidence and command history.
- [x] Add `/devos/runs` and `/devos/runs/:runId` after storage composition.
- [x] Add responsive 360 px layouts and private navigation.
- [x] Do not render prompt transcripts or hidden-state claims.

## Task 5: Cooperative writes

- [x] Add owner-authenticated/manual run registration and lifecycle-transition server functions.
- [ ] Add an authorized agent polling surface for queued commands.
- [x] Require CSRF, explicit confirmation and client idempotency for owner command creation.
- [x] Add queued owner commands separately from direct process control.
- [x] Add domain and SQLite transitions for acknowledge/complete/reject.
- [x] Keep remote MCP writes blocked until authenticated transport gates pass.
- [x] Document the agent participation and MCP-unavailable fallback protocol.

## Implemented routes

```text
/devos/runs
/devos/runs/:runId
```

Both routes require the owner guard and call server-side owner resolution again before opening the private read model. The owner can register a cooperative run, transition its reported lifecycle and enqueue bounded commands; none of these actions starts, resumes or controls an external process.

## Gates

Committed specifications now cover:

- focused domain state/registration/checkpoint/command tests;
- migration, idempotency, optimistic-concurrency and rollback behavior;
- deterministic stale reads;
- malformed historical JSON tolerance;
- command payload confidentiality and expiry bounds;
- owner-only route/server composition;
- responsive run surfaces.

Still required before declaring this phase verified:

- dependency-complete domain/database/web typecheck and Vitest output;
- migration `0001`–`0005` execution against memory and file-backed SQLite;
- authenticated browser registration, lifecycle and command-queue checks;
- anonymous redirect/confidentiality checks for both run routes;
- keyboard and 360 px browser validation;
- full `pnpm check` and production build;
- explicit owner approval before any remote run-write surface.
