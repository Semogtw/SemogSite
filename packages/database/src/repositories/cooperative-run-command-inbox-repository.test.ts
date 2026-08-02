import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteCooperativeRunCommandInboxRepository } from "./cooperative-run-command-inbox-repository";

const observedAt = "2026-08-01T23:00:00.000Z";

function seedRun(database: ReturnType<typeof createSqliteDatabase>): void {
  database.$client
    .prepare(
      `INSERT INTO cooperative_runs (
        id, project_id, title, actor_label, origin, status, phase, progress,
        branch, summary, blocker, next_action, started_at, last_heartbeat_at,
        finished_at, stale_after_seconds, created_at, updated_at
      ) VALUES (
        'run-inbox', NULL, 'Inbox run', 'ChatGPT', 'chatgpt', 'running',
        'Commands', 50, NULL, 'Polling commands.', NULL, 'Read commands.',
        '2026-08-01T20:00:00.000Z', '2026-08-01T22:30:00.000Z', NULL, 3600,
        '2026-08-01T20:00:00.000Z', '2026-08-01T22:30:00.000Z'
      )`,
    )
    .run();
}

function insertCommand(
  database: ReturnType<typeof createSqliteDatabase>,
  input: {
    id: string;
    status: "queued" | "acknowledged" | "completed" | "rejected" | "expired";
    queuedAt: string;
    expiresAt: string | null;
  },
): void {
  database.$client
    .prepare(
      `INSERT INTO cooperative_run_commands (
        id, run_id, kind, status, summary, payload_json, reason, queued_by,
        idempotency_key, correlation_id, queued_at, acknowledged_at,
        completed_at, expires_at, updated_at
      ) VALUES (
        ?, 'run-inbox', 'request_checkpoint', ?, ?, '{"include":["commits"]}',
        NULL, 'semogtw-owner', ?, ?, ?, ?, ?, ?, ?
      )`,
    )
    .run(
      input.id,
      input.status,
      `Summary ${input.id}`,
      `key-${input.id}`,
      `correlation-${input.id}`,
      input.queuedAt,
      input.status === "acknowledged" ? input.queuedAt : null,
      input.status === "completed" || input.status === "rejected" || input.status === "expired"
        ? input.queuedAt
        : null,
      input.expiresAt,
      input.queuedAt,
    );
}

describe("SqliteCooperativeRunCommandInboxRepository", () => {
  it("returns only queued non-expired commands in FIFO order", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedRun(database);
    insertCommand(database, {
      id: "queued-2",
      status: "queued",
      queuedAt: "2026-08-01T22:30:00.000Z",
      expiresAt: null,
    });
    insertCommand(database, {
      id: "queued-1",
      status: "queued",
      queuedAt: "2026-08-01T22:00:00.000Z",
      expiresAt: "2026-08-02T00:00:00.000Z",
    });
    insertCommand(database, {
      id: "expired-by-time",
      status: "queued",
      queuedAt: "2026-08-01T21:00:00.000Z",
      expiresAt: observedAt,
    });
    insertCommand(database, {
      id: "acknowledged",
      status: "acknowledged",
      queuedAt: "2026-08-01T20:00:00.000Z",
      expiresAt: null,
    });
    const repository = new SqliteCooperativeRunCommandInboxRepository(database);

    await expect(
      repository.listPending({ runId: "run-inbox", observedAt, limit: 10 }),
    ).resolves.toEqual([
      expect.objectContaining({ id: "queued-1", status: "queued" }),
      expect.objectContaining({ id: "queued-2", status: "queued" }),
    ]);
    database.$client.close();
  });

  it("respects the requested bound and rejects malformed historical payloads", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedRun(database);
    insertCommand(database, {
      id: "queued-valid",
      status: "queued",
      queuedAt: "2026-08-01T22:00:00.000Z",
      expiresAt: null,
    });
    insertCommand(database, {
      id: "queued-second",
      status: "queued",
      queuedAt: "2026-08-01T22:10:00.000Z",
      expiresAt: null,
    });
    const repository = new SqliteCooperativeRunCommandInboxRepository(database);

    await expect(
      repository.listPending({ runId: "run-inbox", observedAt, limit: 1 }),
    ).resolves.toHaveLength(1);

    database.$client
      .prepare("UPDATE cooperative_run_commands SET payload_json = '{broken' WHERE id = ?")
      .run("queued-valid");
    await expect(
      repository.listPending({ runId: "run-inbox", observedAt, limit: 10 }),
    ).rejects.toThrow("RUN_COMMAND_PAYLOAD_INVALID");
    database.$client.close();
  });
});
