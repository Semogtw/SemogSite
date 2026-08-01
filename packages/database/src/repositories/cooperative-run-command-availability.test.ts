import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteCooperativeRunReadModel } from "./cooperative-run-read-model";

const observedAt = "2026-08-01T23:00:00.000Z";

function seedRun(database: ReturnType<typeof createSqliteDatabase>): void {
  database.$client
    .prepare(
      `INSERT INTO cooperative_runs (
        id, project_id, title, actor_label, origin, status, phase, progress,
        branch, summary, blocker, next_action, started_at, last_heartbeat_at,
        finished_at, stale_after_seconds, created_at, updated_at
      ) VALUES (
        'run-availability', NULL, 'Availability run', 'ChatGPT', 'chatgpt',
        'running', NULL, 25, NULL, 'Waiting commands.', NULL, 'Poll inbox.',
        '2026-08-01T20:00:00.000Z', '2026-08-01T22:00:00.000Z', NULL, 3600,
        '2026-08-01T20:00:00.000Z', '2026-08-01T22:00:00.000Z'
      )`,
    )
    .run();
}

function insertCommand(
  database: ReturnType<typeof createSqliteDatabase>,
  input: {
    id: string;
    status: "queued" | "acknowledged";
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
        ?, 'run-availability', 'continue', ?, ?, '{}', NULL, 'owner', ?, ?,
        '2026-08-01T22:00:00.000Z', ?, NULL, ?, '2026-08-01T22:00:00.000Z'
      )`,
    )
    .run(
      input.id,
      input.status,
      input.id,
      `key-${input.id}`,
      `correlation-${input.id}`,
      input.status === "acknowledged" ? "2026-08-01T22:00:00.000Z" : null,
      input.expiresAt,
    );
}

describe("cooperative command queue availability", () => {
  it("derives expiration without changing persisted status", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedRun(database);
    insertCommand(database, {
      id: "available",
      status: "queued",
      expiresAt: "2026-08-02T00:00:00.000Z",
    });
    insertCommand(database, {
      id: "expired",
      status: "queued",
      expiresAt: observedAt,
    });
    insertCommand(database, {
      id: "no-expiry",
      status: "queued",
      expiresAt: null,
    });
    insertCommand(database, {
      id: "acknowledged",
      status: "acknowledged",
      expiresAt: "2026-08-01T22:30:00.000Z",
    });
    const detail = await new SqliteCooperativeRunReadModel(database).getRun(
      "run-availability",
      observedAt,
    );

    expect(detail?.commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "available",
          status: "queued",
          queueAvailability: "available",
        }),
        expect.objectContaining({
          id: "expired",
          status: "queued",
          queueAvailability: "expired",
        }),
        expect.objectContaining({
          id: "no-expiry",
          status: "queued",
          queueAvailability: "available",
        }),
        expect.objectContaining({
          id: "acknowledged",
          status: "acknowledged",
          queueAvailability: "not_applicable",
        }),
      ]),
    );
    expect(
      database.$client
        .prepare("SELECT status FROM cooperative_run_commands WHERE id = 'expired'")
        .get(),
    ).toEqual({ status: "queued" });
    database.$client.close();
  });

  it("fails visibly for a malformed queued expiration", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedRun(database);
    insertCommand(database, {
      id: "invalid-expiration",
      status: "queued",
      expiresAt: "not-a-date",
    });

    const detail = await new SqliteCooperativeRunReadModel(database).getRun(
      "run-availability",
      observedAt,
    );
    expect(detail?.commands[0]).toMatchObject({
      id: "invalid-expiration",
      status: "queued",
      queueAvailability: "invalid_expiration",
    });
    database.$client.close();
  });
});
