# Cooperative run ledger runbook

## Purpose

Operate and recover the private cooperative run ledger without treating it as live ChatGPT telemetry or direct process control.

## Normal owner workflow

1. Open `/devos/runs` after authenticating as owner.
2. Register a run only for a participant that will report cooperatively.
3. Choose the shortest realistic freshness threshold; silence after the threshold means only **possibly inactive**.
4. Record lifecycle transitions separately from evidence-rich checkpoints.
5. Use checkpoints for commits, tests, blockers and exact next step.
6. Enqueue commands only when the participant has an approved way to poll the queue.
7. Do not mark commands acknowledged/completed from the owner browser.
8. End a run honestly as completed, failed or cancelled; terminal runs retain history and accept no new owner mutations.

## Diagnosing a stale run

A stale read is derived, not a persisted lifecycle change.

1. Confirm the displayed `lastHeartbeatAt`, threshold and `staleAt`.
2. Check the latest event/checkpoint for a known blocker or planned long-running task.
3. Do not automatically cancel or fail the run.
4. Contact/restart the participant through its actual execution channel when available.
5. Record a manual heartbeat/checkpoint only when it truthfully represents a report received from that participant.
6. When the original participant cannot continue, cancel the old run with a reason and register a new run for the replacement rather than rewriting history.

## Command not received

1. Confirm the command appears in the private run detail.
2. Compare persisted status with `queueAvailability`.
3. If `queued + available`, the participant has not acknowledged it; verify its polling adapter/cadence.
4. If `queued + expired`, enqueue a new command with a new idempotency UUID only when the request is still relevant.
5. If `acknowledged`, do not assume applied; wait for `completed` or `rejected`.
6. If `invalid_expiration`, preserve the row for investigation and do not expose it through an agent inbox.
7. Never create an unauthenticated temporary endpoint to deliver the command.

## Lost browser response

Registration, checkpoint, transition and command forms retain one client UUID for the logical attempt.

1. Retry without editing fields; the same UUID should be reused.
2. A successful original write must be returned as duplicate/idempotent, not inserted again.
3. If the user edits the form, the browser deliberately creates a new UUID.
4. A conflict means the same key no longer represents the same stable intent or optimistic state changed; reload before deciding the next action.
5. Do not manually delete duplicate-looking events until the database and idempotency keys are inspected.

## Optimistic conflict

1. Reload the run detail.
2. Review the newest event and `updatedAt`.
3. Re-enter only still-valid information.
4. Use a new logical attempt/idempotency UUID after editing.
5. Never bypass compare-and-swap with a direct SQL update in normal operation.

## Malformed historical JSON

The general owner read model renders malformed history explicitly. The agent inbox fails closed on malformed command payloads.

1. Record the affected run/event/checkpoint/command ID.
2. Create a verified database backup before inspection.
3. Inspect the raw row offline; do not copy secret-bearing values into issues/logs.
4. Determine whether corruption came from old code, manual SQL or storage failure.
5. Prefer an additive repair event/migration over rewriting immutable history.
6. Keep the malformed marker visible until the repair is verified.

## Storage unavailable

1. Stop new owner mutations; server functions already fail without a database.
2. Do not switch to browser/local storage as a private fallback.
3. Verify database path, mount durability, permissions and free space.
4. Verify SQLite integrity and migration history on a copy.
5. Restore from the latest verified backup when corruption is confirmed.
6. Reconcile participant progress from commits/handoffs after storage recovery.
7. Do not claim missing telemetry means missing development work.

## Backup and restore drill

Before deployment and periodically thereafter:

1. apply migrations through `0005_cooperative_run_ledger.sql`;
2. register a disposable run, checkpoint and command;
3. create a verified backup;
4. restore to a different path;
5. verify all four ledger tables and the disposable history;
6. verify existing projects, sessions, evidence and GitHub observations;
7. remove only the disposable fixture through an approved maintenance procedure, not by editing production history casually;
8. record application version, migration version, backup path/identifier and result.

## Incorrect report

The ledger is provenance, not infallible truth.

- Do not rewrite a past event to make it look correct.
- Add a corrective checkpoint/event explaining the discrepancy.
- Cancel and replace a run when ownership or goal changed materially.
- Keep test status honest: `not_run`, `partial`, `passed`, `failed` or `blocked`.
- Link concrete commit/evidence identifiers when possible.

## Security incident

Suspected unauthorized read/write or secret leakage:

1. revoke the owner session/credentials;
2. disable any remote adapter first (none is approved in the current implementation);
3. preserve database and sanitized application logs;
4. rotate affected secrets outside the ledger;
5. inspect run/event/command correlation and idempotency identifiers;
6. determine public/private exposure separately from database compromise;
7. restore/repair only after preserving forensic evidence;
8. document exact versions and timeline without pasting secret payloads.

## Deployment rollback

1. create/verify a backup before deployment;
2. preserve migration `0005` tables during application rollback;
3. deploy the last compatible application version;
4. verify owner auth and pre-ledger DevOS routes;
5. keep remote agent adapters disabled;
6. retain ledger rows for later reconciliation;
7. avoid destructive down-migration as a normal rollback mechanism.

## Current external-access boundary

The internal command inbox is not a deployed endpoint. There is no approved remote MCP/HTTP polling or write surface.

An external adapter must not be enabled until the dedicated security/deployment gates pass, including revocable agent identity, run/project authorization, replay safety, limits, log redaction and rollback.

## First verification commands

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

After those pass, execute migration/backup and authenticated/anonymous browser gates from the dedicated test matrix.