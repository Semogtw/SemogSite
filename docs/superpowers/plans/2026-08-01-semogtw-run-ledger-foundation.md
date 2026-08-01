# Semogtw cooperative run ledger foundation

**Parent plan:** [`2026-08-01-semogtw-chatgpt-execution-control-plane.md`](./2026-08-01-semogtw-chatgpt-execution-control-plane.md)

**Goal:** Establish provider-neutral run state, deterministic freshness and append-only transition proposals before persistence, UI or MCP writes are introduced.

## Product boundary

The run ledger represents cooperative reports supplied by an agent, owner or approved adapter. It does not inspect ChatGPT conversations, hidden model state, background execution or machine processes automatically.

Initial implementation contains no:

- OpenAI API dependency;
- remote MCP write;
- scheduler/background worker;
- webhook;
- process supervision;
- command injection;
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
- `cancel`: move running/blocked → cancelled with explicit reason/confirmation in later adapters.

Every successful transition produces:

- before/after snapshots;
- canonical event kind;
- occurred-at timestamp;
- a sanitized summary suitable for append-only persistence.

Repository adapters will later add stable IDs, actor identity, idempotency key and correlation ID.

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
- invalid/conflicting commands produce no proposed event.

## Task 1: Pure domain state machine

- [ ] Specify run snapshot, freshness and transition contracts.
- [ ] Specify heartbeat/checkpoint, block/resume and terminal transitions.
- [ ] Specify progress, timestamp and optimistic-concurrency validation.
- [ ] Specify terminal immutability and deterministic stale boundary.
- [ ] Implement without framework, storage, timer or runtime imports.
- [ ] Export contracts from `@semogtw/domain`.

## Task 2: Registration service

- [ ] Validate title, actor/origin, optional project/branch and stale threshold.
- [ ] Create a running snapshot with server-owned timestamps.
- [ ] Produce a `run.registered` event proposal.
- [ ] Require stable run/event/idempotency/correlation IDs at the adapter context.

## Task 3: SQLite ledger

- [ ] Add an additive migration after `0004`.
- [ ] Persist runs, immutable events, checkpoints and queued owner commands.
- [ ] Use immediate transactions and optimistic `updated_at` matching.
- [ ] Make event/checkpoint idempotency explicit.
- [ ] Preserve existing development sessions/evidence rather than duplicating them blindly.

## Task 4: Protected reads and UI

- [ ] Add owner-only run list/detail read models.
- [ ] Show lifecycle status and derived freshness separately.
- [ ] Add event history and checkpoint evidence.
- [ ] Add `/devos/runs` only after storage composition is complete.
- [ ] Do not render prompt transcripts or hidden-state claims.

## Task 5: Cooperative writes

- [ ] Add owner-authenticated/manual run registration and transition server functions.
- [ ] Require CSRF, reason/confirmation where destructive, idempotency and audit.
- [ ] Add queued owner commands separately from direct process control.
- [ ] Expose future MCP writes only after authenticated transport gates pass.

## Gates

- focused domain tests and typecheck;
- migration/idempotency/rollback tests;
- stale read determinism;
- authenticated browser lifecycle checks;
- confidentiality scan for prompt/token/session markers;
- full workspace `pnpm check` and build;
- explicit owner approval before any remote write surface.
