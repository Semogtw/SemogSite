import { describe, expect, it } from "vitest";
import type {
  CooperativeRunCommandLifecycleSnapshot,
  CooperativeRunCommandTransitionEvent,
} from "@semogtw/domain";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteCooperativeRunCommandTransitionRepository } from "./cooperative-run-command-transition-repository";

const queuedAt = "2026-08-01T22:00:00.000Z";
const transitionedAt = "2026-08-01T22:10:00.000Z";

function seed(database: ReturnType<typeof createSqliteDatabase>): void {
  database.$client
    .prepare(
      `INSERT INTO cooperative_runs (
        id, project_id, title, actor_label, origin, status, phase, progress,
        branch, summary, blocker, next_action, started_at, last_heartbeat_at,
        finished_at, stale_after_seconds, created_at, updated_at
      ) VALUES (
        'run-integrity', NULL, 'Integrity run', 'ChatGPT', 'chatgpt', 'running',
        'Commands', 50, NULL, 'Queue ready.', NULL, 'Read command.',
        '2026-08-01T20:00:00.000Z', '2026-08-01T21:00:00.000Z', NULL, 3600,
        '2026-08-01T20:00:00.000Z', '2026-08-01T21:00:00.000Z'
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
        'command-integrity', 'run-integrity', 'provide_context', 'queued',
        'Use bounded context.', '{"context":"safe"}', NULL, 'semogtw-owner',
        'queue-key-integrity', 'queue-correlation-integrity', ?, NULL, NULL,
        NULL, ?
      )`,
    )
    .run(queuedAt, queuedAt);
}

function before(): CooperativeRunCommandLifecycleSnapshot {
  return {
    id: "command-integrity",
    runId: "run-integrity",
    kind: "provide_context",
    status: "queued",
    summary: "Use bounded context.",
    payload: { context: "safe" },
    reason: null,
    queuedBy: "semogtw-owner",
    idempotencyKey: "queue-key-integrity",
    correlationId: "queue-correlation-integrity",
    queuedAt,
    acknowledgedAt: null,
    completedAt: null,
    expiresAt: null,
    updatedAt: queuedAt,
  };
}

function transitionEvent(
  initial: CooperativeRunCommandLifecycleSnapshot,
  result: CooperativeRunCommandLifecycleSnapshot,
): CooperativeRunCommandTransitionEvent {
  return {
    id: "event-integrity",
    runId: initial.runId,
    commandId: initial.id,
    kind: "run.command_acknowledged",
    actor: "chatgpt-agent",
    source: "chatgpt",
    summary: "Command acknowledged.",
    before: initial,
    after: result,
    occurredAt: transitionedAt,
    idempotencyKey: "transition-key-integrity",
    correlationId: "transition-correlation-integrity",
  };
}

describe("cooperative command transition integrity", () => {
  it.each([
    ["kind", { kind: "continue" as const }],
    ["summary", { summary: "Changed summary." }],
    ["payload", { payload: { context: "changed" } }],
    ["queuedBy", { queuedBy: "other-owner" }],
    ["correlationId", { correlationId: "changed-correlation" }],
    ["queuedAt", { queuedAt: "2026-08-01T22:01:00.000Z" }],
    ["expiresAt", { expiresAt: "2026-08-02T00:00:00.000Z" }],
  ])("rejects mutation of immutable field %s", async (_field, change) => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seed(database);
    const initial = before();
    const result: CooperativeRunCommandLifecycleSnapshot = {
      ...initial,
      ...change,
      status: "acknowledged",
      acknowledgedAt: transitionedAt,
      updatedAt: transitionedAt,
    };
    const repository = new SqliteCooperativeRunCommandTransitionRepository(
      database,
    );

    await expect(
      repository.apply(initial, result, transitionEvent(initial, result)),
    ).resolves.toBe("conflict");
    expect(
      database.$client
        .prepare("SELECT status, payload_json FROM cooperative_run_commands")
        .get(),
    ).toEqual({ status: "queued", payload_json: '{"context":"safe"}' });
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM cooperative_run_events")
        .get(),
    ).toEqual({ count: 0 });
    database.$client.close();
  });
});
