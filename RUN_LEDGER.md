# Semogtw Cooperative Run Ledger

## Status

The cooperative run ledger is implemented as a private Semogtw DevOS capability. It records state explicitly reported by an owner, agent or approved adapter. It is not live ChatGPT telemetry and does not start, pause, resume or cancel an external process by itself.

Implemented layers:

```text
owner-only DevOS routes and server functions
                    ↓
domain registration / lifecycle / checkpoint / command services
                    ↓
SQLite repositories with immediate transactions and optimistic concurrency
                    ↓
cooperative_runs / events / checkpoints / commands
```

An internal provider-neutral command inbox is also implemented. It reads at most 20 FIFO `queued` commands that have not expired. No authenticated remote adapter currently exposes that inbox.

## Persistence

Migration `0005_cooperative_run_ledger.sql` adds:

- `cooperative_runs`: latest reported run snapshot;
- `cooperative_run_events`: append-only ordered history;
- `cooperative_run_checkpoints`: evidence-rich progress records;
- `cooperative_run_commands`: cooperative owner-to-agent command queue.

The migration is additive and does not replace development sessions, evidence or audit tables.

### Run lifecycle

```text
running ↔ blocked
running → completed | failed | cancelled
blocked → failed | cancelled
```

Terminal states are immutable. Progress is monotonic. `completed` requires 100% and no next action. `blocked` requires both a blocker and an unlock action.

### Freshness

Freshness is derived at read time:

```text
current | stale
```

It uses `lastHeartbeatAt`, `staleAfterSeconds` and an explicit observation timestamp. Reading a stale run never mutates its lifecycle status.

### Checkpoints

A checkpoint atomically:

1. validates the current run and optimistic `updatedAt`;
2. updates reported phase, branch, progress, summary, heartbeat and next action;
3. appends a `run.checkpointed` event;
4. stores commits, test status/summary, blockers and next step.

Committed SHAs are lowercased, deduplicated and validated. Test status must be explicit: `not_run`, `partial`, `passed`, `failed` or `blocked`.

### Commands

Supported owner commands:

- `continue`;
- `pause`;
- `cancel`;
- `reprioritize`;
- `request_checkpoint`;
- `provide_context`.

Commands use kind-specific allowlisted payloads. Arbitrary fields, credential-like keys and payloads above 16 KiB are rejected before storage. Expiration is optional and bounded to 30 days.

Command lifecycle:

```text
queued → acknowledged → completed
queued → rejected
acknowledged → rejected
```

Acknowledgement means the agent read and understood the command. It does not mean the action was applied. Command transitions cannot modify kind, payload, summary, owner identity, original idempotency/correlation data, enqueue time or expiration.

A queued command can remain persisted as `queued` after its expiration time. Reads derive a separate `queueAvailability` value:

```text
available | expired | not_applicable | invalid_expiration
```

The inbox excludes expired commands without silently changing persisted history.

## Idempotency and concurrency

Owner forms create one UUID per logical attempt and retain it across network retries. The server derives stable run, command, checkpoint, event and correlation IDs from that UUID.

Repositories compare stable intent rather than server timestamps when recognizing registration/command retries. Changed content with the same key is a conflict.

Lifecycle/checkpoint/command transitions use compare-and-swap against persisted status and/or `updated_at`. Entity changes and append-only events share an immediate SQLite transaction. An event insertion failure rolls back the entity change.

## Owner-only web surface

Implemented routes:

```text
/devos/runs
/devos/runs/:runId
```

Both routes:

- require the owner route guard;
- resolve the owner again in each server function;
- use `noindex, nofollow, noarchive`;
- never serialize private run data through public DTOs;
- present “reported”, “last update” and “possibly inactive” language rather than hidden-state claims.

Owner mutations require:

- authenticated owner session;
- CSRF token;
- explicit confirmation;
- bounded Zod input;
- client idempotency UUID;
- server-owned actor, event and correlation identities;
- sanitized failure messages.

The browser can:

- register a cooperative run;
- record heartbeat, block, resume and terminal transitions;
- record evidence-rich checkpoints;
- enqueue bounded owner commands.

It cannot acknowledge or complete a command on behalf of an agent.

## Agent participation

See [`docs/AGENT_RUN_PROTOCOL.md`](./docs/AGENT_RUN_PROTOCOL.md).

The protocol requires agents to report only observed work, poll before major steps, acknowledge commands separately from applying them and continue safe repository work if telemetry is unavailable.

## Remote boundary

The ledger is not exposed through remote MCP, HTTP bearer auth or ChatGPT account integration in the current implementation.

A remote agent adapter remains blocked until it proves:

- owner/agent identity and revocation;
- authorization to one run and its project scope;
- authenticated command polling;
- replay/idempotency behavior;
- rate, concurrency and timeout limits;
- private cache and log redaction;
- Host/Origin/TLS policy;
- rollback and endpoint disablement;
- compatibility with the selected host/client.

The existing MCP transport guardrail continues to reject listeners and transport imports in MCP namespaces and MCP imports from web/API.

## Verification state

Committed tests specify:

- run state invariants and deterministic freshness;
- registration, lifecycle, checkpoints and commands;
- migration `0001`–`0005` and backup expectations;
- SQLite atomicity, idempotency, optimistic conflicts and rollback;
- malformed historical JSON tolerance;
- FIFO non-expired command inbox reads;
- immutable command-transition fields;
- derived command availability without persisted mutation.

These tests remain specifications until observed in a dependency-complete environment. The PR must remain draft until focused tests, full typecheck, migrations, build and authenticated/anonymous browser gates pass.
