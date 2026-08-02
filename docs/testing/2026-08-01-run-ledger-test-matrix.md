# Cooperative run ledger test matrix

## Evidence policy

This file separates committed specifications from observed passage evidence.

The current environment did not provide a current dependency-complete repository snapshot, so the new Vitest, migration, browser and build gates below are **not marked passed**. They must be executed before the draft PR becomes ready for review.

## Domain suites

### Run state

Specify:

- valid running/blocked/terminal snapshots;
- heartbeat/checkpoint without implicit lifecycle change;
- running ↔ blocked;
- running → completed/failed/cancelled;
- blocked → failed/cancelled;
- terminal immutability;
- monotonic integer progress;
- required next action/blocker/reason fields;
- timestamp ordering and exact optimistic `expectedUpdatedAt`;
- deterministic current/stale boundary.

### Registration

Specify:

- bounded title/actor/origin/phase/branch/summary/action;
- stale threshold from 300 to 86,400 seconds;
- server-owned timestamps and initial running snapshot;
- `run.registered` event proposal;
- duplicate/project-not-found/conflict result mapping.

### Checkpoint

Specify:

- progress, phase, branch, summary and next-step validation;
- commit SHA normalization/deduplication/max 100;
- explicit test status and summary;
- blocker preservation;
- source hash validation;
- stale/terminal/current-state rejection;
- event/checkpoint/run proposal consistency.

### Owner command queue

Specify:

- all six command kinds;
- kind-specific allowlisted payloads;
- rejection of unknown fields and credential-like keys;
- 16 KiB payload bound;
- optional expiration and 30-day maximum;
- terminal run rejection;
- stable command/event/idempotency/correlation proposal.

### Command lifecycle

Specify:

- queued → acknowledged;
- acknowledged → completed;
- queued/acknowledged → rejected with reason;
- acknowledgement distinct from application;
- terminal immutability;
- stale/current-state/expiration validation;
- exact event kinds and timestamps.

### Agent inbox

Specify:

- trim/canonicalize run ID and observed time;
- limits normalized to 1–20;
- FIFO queued commands only;
- non-expired results only;
- no acknowledgement side effect;
- fail closed on wrong-run, nonqueued or expired repository results.

## SQLite repository suites

### Migration

Run `0001` through `0005` on:

- in-memory database;
- file-backed database;
- repeated/idempotent migration invocation.

Assert:

- four ledger tables exist;
- foreign keys and indexes exist;
- previous schema/data remain intact;
- backup/restore recognizes `0005_cooperative_run_ledger.sql`.

### Registration

Assert:

- run and sequence-1 event insert atomically;
- archived/missing project rejected;
- duplicate stable intent recognized despite later server timestamp;
- changed intent with same key conflicts;
- event failure rolls back the run.

### Lifecycle transitions

Assert:

- CAS update plus ordered event;
- stale status/updatedAt conflicts;
- duplicate event recognized only with exact after state;
- event failure rolls back run update;
- terminal state cannot transition.

### Checkpoints

Assert:

- run update, event and checkpoint share one immediate transaction;
- sequence is monotonic per run;
- source hash/idempotency conflict behavior;
- stale run rejection;
- event/checkpoint insertion failure rolls back run update.

### Command queue

Assert:

- command and event insert atomically;
- delayed retry with same stable intent deduplicates;
- changed intent with same key conflicts;
- stale/terminal run rejected;
- event failure rolls back command insertion.

### Command transitions

Assert:

- CAS status/update and event insertion;
- duplicate exact result recognized;
- stale command rejected;
- event failure rolls back command update;
- immutable kind/payload/summary/owner/idempotency/correlation/time/expiration fields cannot change;
- only exact lifecycle/event pairs are accepted.

### Read models

Assert:

- run ordering and limits;
- freshness derives from supplied observation time;
- events/checkpoints/commands are bounded;
- malformed before/after/commits/payload JSON is surfaced safely;
- queued command availability derives without persisted mutation;
- malformed expiration is visible;
- inbox returns FIFO non-expired queued commands and rejects malformed payload JSON.

## Web/server-function suites

Static/component tests should cover:

- run list/detail require owner twice (route and server function);
- anonymous users redirect before private data access;
- registration, lifecycle, checkpoint and command schemas reject oversize/invalid data;
- CSRF failure produces no write;
- literal confirmation is required;
- IDs/correlation are server-derived from the client UUID;
- retries retain UUID until success;
- lifecycle options depend on current status;
- checkpoint is separate from generic lifecycle transitions;
- owner cannot acknowledge/complete a command through the browser;
- terminal runs show history but no mutation forms;
- status and freshness use distinct labels;
- command status and queue availability use distinct labels;
- error messages do not expose SQL/filesystem/exception text.

## Browser gates

Authenticated browser scenarios:

1. log in as owner;
2. register a run with optional project;
3. verify it appears in `/devos/runs`;
4. open detail and verify reported/not-live wording;
5. send heartbeat;
6. record evidence-rich checkpoint with test status;
7. block and resume;
8. enqueue every command kind;
9. verify payload/history and derived expiration;
10. complete/fail/cancel a separate run;
11. verify terminal forms disappear;
12. retry a lost-response simulation and confirm no duplicate rows/events.

Anonymous browser scenarios:

- `/devos/runs` redirects to login;
- `/devos/runs/<id>` redirects to login;
- server-function/RPC endpoints reject unauthenticated calls;
- public pages/source contain no run IDs, summaries, branches, commands or checkpoint evidence.

Accessibility/responsive scenarios:

- keyboard-only registration/transition/checkpoint/command workflows;
- focus visibility and logical order;
- screen-reader labels for status/freshness/availability;
- no horizontal overflow at 360×800;
- long branches, summaries, hashes and JSON wrap/scroll within their containers;
- touch targets meet the existing design-system minimum.

## Canonical execution order

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

Then execute authenticated/anonymous browser gates in the selected runtime.

## Passage recording

A future verification report must record:

- exact branch and commit SHA;
- Node/pnpm versions;
- resolved dependency versions;
- each command and exit code;
- migration/backup database paths or disposable test identifiers;
- browser viewport and route list;
- failing diagnostics without secret values;
- fixes and rerun output.

Do not replace this matrix with a blanket “tests passed” statement.
