import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteCooperativeRunReadModel } from "./cooperative-run-read-model";

const startedAt = "2026-08-01T20:00:00.000Z";

function insertRun(
  database: ReturnType<typeof createSqliteDatabase>,
  input: {
    id: string;
    status: "running" | "blocked" | "completed" | "failed" | "cancelled";
    lastHeartbeatAt: string;
    updatedAt: string;
    progress?: number;
    blocker?: string | null;
    nextAction?: string | null;
    finishedAt?: string | null;
  },
): void {
  const terminal = ["completed", "failed", "cancelled"].includes(input.status);
  const completed = input.status === "completed";
  database.$client
    .prepare(
      `INSERT INTO cooperative_runs (
        id, project_id, title, actor_label, origin, status, phase, progress,
        branch, summary, blocker, next_action, started_at, last_heartbeat_at,
        finished_at, stale_after_seconds, created_at, updated_at
      ) VALUES (?, 'demo-project-platform', ?, 'ChatGPT', 'chatgpt', ?,
        'Implementation', ?, 'develop/foundation-bootstrap', ?, ?, ?, ?, ?, ?,
        3600, ?, ?)`,
    )
    .run(
      input.id,
      `Run ${input.id}`,
      input.status,
      input.progress ?? (completed ? 100 : 40),
      `Summary ${input.id}`,
      input.blocker ??
        (input.status === "blocked" || input.status === "failed" || input.status === "cancelled"
          ? `Reason ${input.id}`
          : null),
      input.nextAction ?? (terminal ? null : `Next ${input.id}`),
      startedAt,
      input.lastHeartbeatAt,
      input.finishedAt ?? (terminal ? input.updatedAt : null),
      startedAt,
      input.updatedAt,
    );
}

function insertEvent(
  database: ReturnType<typeof createSqliteDatabase>,
  input: {
    id: string;
    runId: string;
    sequence: number;
    kind: "run.registered" | "run.checkpoint" | "run.completed";
    beforeJson: string | null;
    afterJson: string | null;
    occurredAt: string;
  },
): void {
  database.$client
    .prepare(
      `INSERT INTO cooperative_run_events (
        id, run_id, sequence, kind, actor, source, summary, before_json,
        after_json, occurred_at, idempotency_key, correlation_id
      ) VALUES (?, ?, ?, ?, 'semogtw-owner', 'manual', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      input.runId,
      input.sequence,
      input.kind,
      `Event ${input.id}`,
      input.beforeJson,
      input.afterJson,
      input.occurredAt,
      `idempotency-${input.id}`,
      `correlation-${input.id}`,
    );
}

describe("SqliteCooperativeRunReadModel", () => {
  it("lists lifecycle state separately from deterministic freshness", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertRun(database, {
      id: "run-current",
      status: "running",
      lastHeartbeatAt: "2026-08-01T20:30:00.000Z",
      updatedAt: "2026-08-01T20:30:00.000Z",
    });
    insertRun(database, {
      id: "run-stale",
      status: "blocked",
      lastHeartbeatAt: "2026-08-01T19:00:00.000Z",
      updatedAt: "2026-08-01T19:00:00.000Z",
    });
    insertRun(database, {
      id: "run-completed",
      status: "completed",
      lastHeartbeatAt: "2026-08-01T18:30:00.000Z",
      updatedAt: "2026-08-01T18:30:00.000Z",
    });
    const model = new SqliteCooperativeRunReadModel(database);

    await expect(
      model.listRuns({ observedAt: "2026-08-01T21:00:00.000Z", limit: 10 }),
    ).resolves.toEqual([
      expect.objectContaining({
        id: "run-current",
        status: "running",
        freshness: "current",
        staleAt: "2026-08-01T21:30:00.000Z",
      }),
      expect.objectContaining({
        id: "run-stale",
        status: "blocked",
        freshness: "stale",
        staleAt: "2026-08-01T20:00:00.000Z",
      }),
      expect.objectContaining({
        id: "run-completed",
        status: "completed",
        freshness: "current",
        staleAt: null,
      }),
    ]);
    database.$client.close();
  });

  it("returns run detail with ordered events and sanitized malformed JSON", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertRun(database, {
      id: "run-detail",
      status: "running",
      lastHeartbeatAt: "2026-08-01T20:30:00.000Z",
      updatedAt: "2026-08-01T20:30:00.000Z",
    });
    insertEvent(database, {
      id: "event-1",
      runId: "run-detail",
      sequence: 1,
      kind: "run.registered",
      beforeJson: null,
      afterJson: JSON.stringify({ status: "running", progress: 0 }),
      occurredAt: startedAt,
    });
    insertEvent(database, {
      id: "event-2",
      runId: "run-detail",
      sequence: 2,
      kind: "run.checkpoint",
      beforeJson: "{broken",
      afterJson: JSON.stringify({ status: "running", progress: 40 }),
      occurredAt: "2026-08-01T20:30:00.000Z",
    });
    const model = new SqliteCooperativeRunReadModel(database);

    await expect(
      model.getRun("run-detail", "2026-08-01T21:00:00.000Z"),
    ).resolves.toEqual({
      run: expect.objectContaining({
        id: "run-detail",
        freshness: "current",
      }),
      events: [
        expect.objectContaining({
          id: "event-2",
          sequence: 2,
          before: null,
          after: { status: "running", progress: 40 },
          malformedJson: ["before"],
        }),
        expect.objectContaining({
          id: "event-1",
          sequence: 1,
          before: null,
          after: { status: "running", progress: 0 },
          malformedJson: [],
        }),
      ],
    });
    await expect(
      model.getRun("missing", "2026-08-01T21:00:00.000Z"),
    ).resolves.toBeNull();
    database.$client.close();
  });

  it("normalizes list limits and rejects invalid observation time", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertRun(database, {
      id: "run-one",
      status: "running",
      lastHeartbeatAt: startedAt,
      updatedAt: startedAt,
    });
    const model = new SqliteCooperativeRunReadModel(database);

    await expect(
      model.listRuns({ observedAt: "invalid", limit: Number.POSITIVE_INFINITY }),
    ).rejects.toThrow("RUN_OBSERVED_AT_INVALID");
    await expect(
      model.listRuns({ observedAt: "2026-08-01T20:30:00.000Z", limit: 0 }),
    ).resolves.toHaveLength(1);
    database.$client.close();
  });
});
