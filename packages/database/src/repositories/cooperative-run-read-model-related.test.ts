import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteCooperativeRunReadModel } from "./cooperative-run-read-model";

const startedAt = "2026-08-01T20:00:00.000Z";
const checkpointAt = "2026-08-01T20:30:00.000Z";

function seedRun(database: ReturnType<typeof createSqliteDatabase>): void {
  database.$client
    .prepare(
      `INSERT INTO cooperative_runs (
        id, project_id, title, actor_label, origin, status, phase, progress,
        branch, summary, blocker, next_action, started_at, last_heartbeat_at,
        finished_at, stale_after_seconds, created_at, updated_at
      ) VALUES (
        'run-detail-related', 'demo-project-platform', 'Run detail', 'ChatGPT',
        'chatgpt', 'running', 'Ledger', 40, 'develop/foundation-bootstrap',
        'Checkpoint ready.', NULL, 'Continue persistence.', ?, ?, NULL, 3600,
        ?, ?
      )`,
    )
    .run(startedAt, checkpointAt, startedAt, checkpointAt);

  database.$client
    .prepare(
      `INSERT INTO cooperative_run_events (
        id, run_id, sequence, kind, actor, source, summary, before_json,
        after_json, occurred_at, idempotency_key, correlation_id
      ) VALUES (
        'event-checkpoint', 'run-detail-related', 1, 'run.checkpoint',
        'semogtw-owner', 'manual', 'Checkpoint ready.', '{}', '{}', ?,
        'checkpoint-1', 'correlation-checkpoint-1'
      )`,
    )
    .run(checkpointAt);

  database.$client
    .prepare(
      `INSERT INTO cooperative_run_checkpoints (
        id, run_id, event_id, sequence, phase, progress, branch, summary,
        commits_json, tests_status, tests_summary, blockers, next_step,
        captured_at, source_hash
      ) VALUES (
        'checkpoint-valid', 'run-detail-related', 'event-checkpoint', 1,
        'Ledger', 40, 'develop/foundation-bootstrap', 'Checkpoint ready.',
        '["abcdef123","1234567"]', 'partial', 'Focused checks only.', '',
        'Continue persistence.', ?, 'source-checkpoint-valid'
      )`,
    )
    .run(checkpointAt);

  database.$client
    .prepare(
      `INSERT INTO cooperative_run_events (
        id, run_id, sequence, kind, actor, source, summary, before_json,
        after_json, occurred_at, idempotency_key, correlation_id
      ) VALUES (
        'event-checkpoint-malformed', 'run-detail-related', 2,
        'run.checkpoint', 'semogtw-owner', 'manual', 'Malformed history.',
        '{}', '{}', ?, 'checkpoint-2', 'correlation-checkpoint-2'
      )`,
    )
    .run("2026-08-01T20:40:00.000Z");

  database.$client
    .prepare(
      `INSERT INTO cooperative_run_checkpoints (
        id, run_id, event_id, sequence, phase, progress, branch, summary,
        commits_json, tests_status, tests_summary, blockers, next_step,
        captured_at, source_hash
      ) VALUES (
        'checkpoint-malformed', 'run-detail-related',
        'event-checkpoint-malformed', 2, 'Ledger', 40,
        'develop/foundation-bootstrap', 'Malformed history.', '{broken',
        'not_run', 'Not run.', '', 'Continue persistence.',
        '2026-08-01T20:40:00.000Z', 'source-checkpoint-malformed'
      )`,
    )
    .run();

  database.$client
    .prepare(
      `INSERT INTO cooperative_run_commands (
        id, run_id, kind, status, summary, payload_json, reason, queued_by,
        idempotency_key, correlation_id, queued_at, acknowledged_at,
        completed_at, expires_at, updated_at
      ) VALUES (
        'command-queued', 'run-detail-related', 'request_checkpoint', 'queued',
        'Send another checkpoint.', '{"priority":"high"}', NULL,
        'semogtw-owner', 'command-queued-key', 'correlation-command-queued',
        '2026-08-01T20:45:00.000Z', NULL, NULL,
        '2026-08-01T22:00:00.000Z', '2026-08-01T20:45:00.000Z'
      )`,
    )
    .run();

  database.$client
    .prepare(
      `INSERT INTO cooperative_run_commands (
        id, run_id, kind, status, summary, payload_json, reason, queued_by,
        idempotency_key, correlation_id, queued_at, acknowledged_at,
        completed_at, expires_at, updated_at
      ) VALUES (
        'command-rejected', 'run-detail-related', 'provide_context', 'rejected',
        'Use private context.', '["not-an-object"]', 'Unsafe context.',
        'semogtw-owner', 'command-rejected-key',
        'correlation-command-rejected', '2026-08-01T20:35:00.000Z',
        '2026-08-01T20:36:00.000Z', '2026-08-01T20:37:00.000Z', NULL,
        '2026-08-01T20:37:00.000Z'
      )`,
    )
    .run();
}

describe("SqliteCooperativeRunReadModel related records", () => {
  it("returns checkpoints and commands with bounded, sanitized JSON", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedRun(database);
    const model = new SqliteCooperativeRunReadModel(database);

    await expect(
      model.getRun("run-detail-related", "2026-08-01T21:00:00.000Z"),
    ).resolves.toEqual({
      run: expect.objectContaining({ id: "run-detail-related" }),
      events: expect.any(Array),
      checkpoints: [
        expect.objectContaining({
          id: "checkpoint-malformed",
          sequence: 2,
          commits: [],
          malformedCommits: true,
        }),
        expect.objectContaining({
          id: "checkpoint-valid",
          sequence: 1,
          commits: ["abcdef123", "1234567"],
          malformedCommits: false,
        }),
      ],
      commands: [
        expect.objectContaining({
          id: "command-queued",
          status: "queued",
          payload: { priority: "high" },
          malformedPayload: false,
        }),
        expect.objectContaining({
          id: "command-rejected",
          status: "rejected",
          payload: null,
          malformedPayload: true,
          reason: "Unsafe context.",
        }),
      ],
    });

    database.$client.close();
  });
});
