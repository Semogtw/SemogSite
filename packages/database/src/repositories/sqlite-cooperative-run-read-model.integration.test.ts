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

function insertRun(
  db: ReturnType<typeof createSqliteDatabase>,
  input: {
    id: string;
    updatedAt: string;
    status?: "running" | "completed" | "failed" | "cancelled";
    progress?: number;
  },
) {
  db.$client
    .prepare(
      `INSERT INTO cooperative_runs (
        id, project_id, title, actor_label, origin, status, phase, progress,
        branch, summary, blocker, next_action, started_at, last_heartbeat_at,
        finished_at, stale_after_seconds, created_at, updated_at
      ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      `Run ${input.id}`,
      "ChatGPT",
      "chatgpt",
      input.status ?? "running",
      "validation",
      input.progress ?? 50,
      "main",
      `Summary ${input.id}`,
      (input.status ?? "running") === "running" ? "Continue." : null,
      "2026-08-09T04:00:00.000Z",
      input.updatedAt,
      input.status === "completed" ? input.updatedAt : null,
      1800,
      "2026-08-09T04:00:00.000Z",
      input.updatedAt,
    );
}

function insertEvent(
  db: ReturnType<typeof createSqliteDatabase>,
  runId: string,
  sequence: number,
) {
  db.$client
    .prepare(
      `INSERT INTO cooperative_run_events (
        id, run_id, sequence, kind, actor, source, summary, before_json,
        after_json, occurred_at, idempotency_key, correlation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      `event-${runId}-${sequence}`,
      runId,
      sequence,
      "run.checkpoint",
      "semogtw-owner",
      "chatgpt",
      `Event ${sequence}`,
      JSON.stringify({ progress: sequence - 1 }),
      JSON.stringify({ progress: sequence }),
      `2026-08-09T04:${String(sequence).padStart(2, "0")}:00.000Z`,
      `idempotency-${runId}-${sequence}`,
      `correlation-${runId}-${sequence}`,
    );
}

describe("SqliteCooperativeRunReadModel integration", () => {
  it("uses deterministic keyset ordering against the real migrated schema", async () => {
    const db = database();
    insertRun(db, {
      id: "run-c",
      updatedAt: "2026-08-09T04:30:00.000Z",
    });
    insertRun(db, {
      id: "run-b",
      updatedAt: "2026-08-09T04:30:00.000Z",
    });
    insertRun(db, {
      id: "run-a",
      updatedAt: "2026-08-09T04:20:00.000Z",
    });
    const model = new SqliteCooperativeRunReadModel(db);

    await expect(model.listRecent({ limit: 2 })).resolves.toMatchObject([
      { id: "run-c" },
      { id: "run-b" },
    ]);
    await expect(
      model.listRecent({
        limit: 2,
        cursor: {
          updatedAt: "2026-08-09T04:30:00.000Z",
          id: "run-b",
        },
      }),
    ).resolves.toMatchObject([{ id: "run-a" }]);
  });

  it("filters canonical running state without changing terminal records", async () => {
    const db = database();
    insertRun(db, {
      id: "run-running",
      updatedAt: "2026-08-09T04:30:00.000Z",
      status: "running",
    });
    insertRun(db, {
      id: "run-completed",
      updatedAt: "2026-08-09T04:31:00.000Z",
      status: "completed",
      progress: 100,
    });
    const model = new SqliteCooperativeRunReadModel(db);

    await expect(
      model.listRecent({ limit: 10, status: "running" }),
    ).resolves.toMatchObject([{ id: "run-running", status: "running" }]);
    await expect(model.findRun("run-completed")).resolves.toMatchObject({
      id: "run-completed",
      status: "completed",
      progress: 100,
    });
  });

  it("reads checkpoints and commands from the migrated schema with defensive JSON", async () => {
    const db = database();
    insertRun(db, {
      id: "run-related",
      updatedAt: "2026-08-09T04:30:00.000Z",
    });
    insertEvent(db, "run-related", 1);
    db.$client
      .prepare(
        `INSERT INTO cooperative_run_checkpoints (
          id, run_id, event_id, sequence, phase, progress, branch, summary,
          commits_json, tests_status, tests_summary, blockers, next_step,
          captured_at, source_hash
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "checkpoint-related",
        "run-related",
        "event-run-related-1",
        1,
        "validation",
        60,
        "main",
        "Checkpoint related.",
        "{broken",
        "partial",
        "Focused checks only.",
        "",
        "Continue.",
        "2026-08-09T04:30:00.000Z",
        "source-related",
      );
    db.$client
      .prepare(
        `INSERT INTO cooperative_run_commands (
          id, run_id, kind, status, summary, payload_json, reason, queued_by,
          idempotency_key, correlation_id, queued_at, acknowledged_at,
          completed_at, expires_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "command-related",
        "run-related",
        "request_checkpoint",
        "queued",
        "Send checkpoint.",
        '{"include":["commits"]}',
        null,
        "semogtw-owner",
        "command-related-key",
        "correlation-command-related",
        "2026-08-09T04:25:00.000Z",
        null,
        null,
        "2026-08-09T04:29:00.000Z",
        "2026-08-09T04:25:00.000Z",
      );
    const model = new SqliteCooperativeRunReadModel(db);

    await expect(model.listCheckpoints("run-related", 500)).resolves.toEqual([
      expect.objectContaining({
        id: "checkpoint-related",
        commits: [],
        malformedCommits: true,
      }),
    ]);
    await expect(
      model.listCommands("run-related", {
        limit: 500,
        observedAt: "2026-08-09T04:30:00.000Z",
      }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "command-related",
        payload: { include: ["commits"] },
        malformedPayload: false,
        queueAvailability: "expired",
      }),
    ]);
  });

  it("paginates the immutable event sequence on the real ledger table", async () => {
    const db = database();
    insertRun(db, {
      id: "run-events",
      updatedAt: "2026-08-09T04:30:00.000Z",
    });
    for (const sequence of [1, 2, 3]) insertEvent(db, "run-events", sequence);
    const model = new SqliteCooperativeRunReadModel(db);

    await expect(
      model.listEvents("run-events", { limit: 2 }),
    ).resolves.toMatchObject([{ sequence: 3 }, { sequence: 2 }]);
    await expect(
      model.listEvents("run-events", { limit: 2, beforeSequence: 2 }),
    ).resolves.toMatchObject([{ sequence: 1 }]);
  });
});
