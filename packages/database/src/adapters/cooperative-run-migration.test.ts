import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "./sqlite";

const now = "2026-08-01T20:00:00.000Z";

function insertRun(
  database: ReturnType<typeof createSqliteDatabase>,
  id = "run-1",
): void {
  database.$client
    .prepare(
      `INSERT INTO cooperative_runs (
        id, project_id, title, actor_label, origin, status, phase, progress,
        branch, summary, blocker, next_action, started_at, last_heartbeat_at,
        finished_at, stale_after_seconds, created_at, updated_at
      ) VALUES (?, NULL, 'Run', 'ChatGPT', 'chatgpt', 'running', NULL, 0,
        'main', 'Started.', NULL, 'Continue.', ?, ?, NULL, 3600, ?, ?)`,
    )
    .run(id, now, now, now, now);
}

describe("0005 cooperative run ledger", () => {
  it("applies the migration and enforces lifecycle state checks", () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);

    expect(
      database.$client
        .prepare("SELECT name FROM _semogtw_migrations WHERE name = ?")
        .get("0005_cooperative_run_ledger.sql"),
    ).toEqual({ name: "0005_cooperative_run_ledger.sql" });

    expect(() =>
      database.$client
        .prepare(
          `INSERT INTO cooperative_runs (
            id, project_id, title, actor_label, origin, status, phase,
            progress, branch, summary, blocker, next_action, started_at,
            last_heartbeat_at, finished_at, stale_after_seconds, created_at,
            updated_at
          ) VALUES ('invalid-running', NULL, 'Run', 'Agent', 'other',
            'running', NULL, 0, NULL, 'Started.', NULL, NULL, ?, ?, NULL,
            3600, ?, ?)`,
        )
        .run(now, now, now, now),
    ).toThrow();

    expect(() =>
      database.$client
        .prepare(
          `INSERT INTO cooperative_runs (
            id, project_id, title, actor_label, origin, status, phase,
            progress, branch, summary, blocker, next_action, started_at,
            last_heartbeat_at, finished_at, stale_after_seconds, created_at,
            updated_at
          ) VALUES ('invalid-complete', NULL, 'Run', 'Agent', 'other',
            'completed', NULL, 99, NULL, 'Done.', NULL, NULL, ?, ?, ?,
            3600, ?, ?)`,
        )
        .run(now, now, now, now, now),
    ).toThrow();

    insertRun(database);
    expect(
      database.$client
        .prepare("SELECT status, progress, next_action FROM cooperative_runs")
        .get(),
    ).toEqual({ status: "running", progress: 0, next_action: "Continue." });
    database.$client.close();
  });

  it("enforces event/command idempotency and cascades run children", () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertRun(database);

    database.$client
      .prepare(
        `INSERT INTO cooperative_run_events (
          id, run_id, sequence, kind, actor, source, summary, before_json,
          after_json, occurred_at, idempotency_key, correlation_id
        ) VALUES ('event-1', 'run-1', 1, 'run.registered', 'owner',
          'manual', 'Registered.', NULL, '{}', ?, 'register-1', 'corr-1')`,
      )
      .run(now);
    expect(() =>
      database.$client
        .prepare(
          `INSERT INTO cooperative_run_events (
            id, run_id, sequence, kind, actor, source, summary, before_json,
            after_json, occurred_at, idempotency_key, correlation_id
          ) VALUES ('event-2', 'run-1', 2, 'run.heartbeat', 'owner',
            'manual', 'Duplicate key.', '{}', '{}', ?, 'register-1', 'corr-2')`,
        )
        .run(now),
    ).toThrow();

    database.$client
      .prepare(
        `INSERT INTO cooperative_run_checkpoints (
          id, run_id, event_id, sequence, phase, progress, branch, summary,
          commits_json, tests_status, tests_summary, blockers, next_step,
          captured_at, source_hash
        ) VALUES ('checkpoint-1', 'run-1', 'event-1', 1, NULL, 0, 'main',
          'Registered checkpoint.', '[]', 'not_run', '', '', 'Continue.',
          ?, 'checkpoint-hash-1')`,
      )
      .run(now);
    database.$client
      .prepare(
        `INSERT INTO cooperative_run_commands (
          id, run_id, kind, status, summary, payload_json, reason, queued_by,
          idempotency_key, correlation_id, queued_at, acknowledged_at,
          completed_at, expires_at, updated_at
        ) VALUES ('command-1', 'run-1', 'request_checkpoint', 'queued',
          'Send a checkpoint.', '{}', NULL, 'owner', 'command-key-1',
          'corr-command-1', ?, NULL, NULL, NULL, ?)`,
      )
      .run(now, now);
    expect(() =>
      database.$client
        .prepare(
          `INSERT INTO cooperative_run_commands (
            id, run_id, kind, status, summary, payload_json, reason,
            queued_by, idempotency_key, correlation_id, queued_at,
            acknowledged_at, completed_at, expires_at, updated_at
          ) VALUES ('command-2', 'run-1', 'continue', 'queued',
            'Duplicate.', '{}', NULL, 'owner', 'command-key-1', 'corr-2',
            ?, NULL, NULL, NULL, ?)`,
        )
        .run(now, now),
    ).toThrow();

    database.$client
      .prepare("DELETE FROM cooperative_runs WHERE id = ?")
      .run("run-1");
    for (const table of [
      "cooperative_run_events",
      "cooperative_run_checkpoints",
      "cooperative_run_commands",
    ]) {
      expect(
        database.$client.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get(),
      ).toEqual({ count: 0 });
    }
    database.$client.close();
  });
});
