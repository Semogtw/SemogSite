import { afterEach, describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../index";
import { SqliteCooperativeRunReadModel } from "./sqlite-cooperative-run-read-model";

const openDatabases: ReturnType<typeof createSqliteDatabase>[] = [];

function database() {
  const db = createSqliteDatabase(":memory:");
  openDatabases.push(db);
  migrate(db);
  return db;
}

afterEach(() => {
  while (openDatabases.length > 0) {
    openDatabases.pop()?.$client.close();
  }
});

function seedRunWithEvent(db: ReturnType<typeof createSqliteDatabase>) {
  db.$client
    .prepare(
      `INSERT INTO cooperative_runs (
        id, project_id, title, actor_label, origin, status, phase, progress,
        branch, summary, blocker, next_action, started_at, last_heartbeat_at,
        finished_at, stale_after_seconds, created_at, updated_at
      ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, NULL, ?, ?, ?)`,
    )
    .run(
      "cooperative-run-snapshots",
      "Snapshot minimization",
      "ChatGPT",
      "chatgpt",
      "running",
      "privacy",
      75,
      "main",
      "Validate storage projection.",
      "Continue.",
      "2026-08-09T04:00:00.000Z",
      "2026-08-09T04:30:00.000Z",
      1800,
      "2026-08-09T04:00:00.000Z",
      "2026-08-09T04:30:00.000Z",
    );

  db.$client
    .prepare(
      `INSERT INTO cooperative_run_events (
        id, run_id, sequence, kind, actor, source, summary, before_json,
        after_json, occurred_at, idempotency_key, correlation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "cooperative-run-event-snapshots",
      "cooperative-run-snapshots",
      1,
      "progress.updated",
      "semogtw-owner",
      "chatgpt",
      "Snapshot-bearing event.",
      JSON.stringify({ progress: 50, secretFragment: "before-secret" }),
      JSON.stringify({ progress: 75, secretFragment: "after-secret" }),
      "2026-08-09T04:30:00.000Z",
      "snapshot-minimization-1",
      "snapshot-minimization-correlation-1",
    );
}

describe("SQLite cooperative run event snapshot minimization", () => {
  it("does not load persisted snapshots by default", async () => {
    const db = database();
    seedRunWithEvent(db);
    const model = new SqliteCooperativeRunReadModel(db);

    await expect(
      model.listEvents("cooperative-run-snapshots", { limit: 10 }),
    ).resolves.toMatchObject([
      {
        id: "cooperative-run-event-snapshots",
        before: null,
        after: null,
      },
    ]);
  });

  it("loads and parses snapshots only after explicit opt-in", async () => {
    const db = database();
    seedRunWithEvent(db);
    const model = new SqliteCooperativeRunReadModel(db);

    await expect(
      model.listEvents("cooperative-run-snapshots", {
        limit: 10,
        includeSnapshots: true,
      }),
    ).resolves.toMatchObject([
      {
        id: "cooperative-run-event-snapshots",
        before: { progress: 50, secretFragment: "before-secret" },
        after: { progress: 75, secretFragment: "after-secret" },
      },
    ]);
  });
});
