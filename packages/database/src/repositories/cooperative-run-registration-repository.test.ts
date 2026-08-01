import { describe, expect, it } from "vitest";
import type {
  CooperativeRunRegistrationEvent,
  CooperativeRunSnapshot,
} from "@semogtw/domain";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteCooperativeRunRegistrationRepository } from "./cooperative-run-registration-repository";

const now = "2026-08-01T20:00:00.000Z";

function run(
  id = "run-1",
  projectId: string | null = "demo-project-platform",
): CooperativeRunSnapshot {
  return {
    id,
    projectId,
    title: "Foundation implementation",
    actorLabel: "ChatGPT",
    origin: "chatgpt",
    status: "running",
    phase: "MCP hardening",
    progress: 0,
    branch: "develop/foundation-bootstrap",
    summary: "Read-only MCP adapter implemented.",
    blocker: null,
    nextAction: "Run dependency-complete tests.",
    startedAt: now,
    lastHeartbeatAt: now,
    finishedAt: null,
    staleAfterSeconds: 3_600,
    updatedAt: now,
  };
}

function event(
  value: CooperativeRunSnapshot,
  overrides: Partial<CooperativeRunRegistrationEvent> = {},
): CooperativeRunRegistrationEvent {
  return {
    id: "run-event-1",
    runId: value.id,
    kind: "run.registered",
    actor: "semogtw-owner",
    summary: value.summary,
    occurredAt: now,
    source: value.origin,
    idempotencyKey: "chatgpt-run-2026-08-01-1",
    correlationId: "correlation-run-1",
    ...overrides,
  };
}

describe("SqliteCooperativeRunRegistrationRepository", () => {
  it("inserts the run and immutable registration event atomically", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteCooperativeRunRegistrationRepository(database);
    const value = run();
    const registered = event(value);

    await expect(repository.register(value, registered)).resolves.toBe(
      "created",
    );

    expect(
      database.$client
        .prepare(
          `SELECT id, project_id, title, actor_label, origin, status, phase,
                  progress, branch, summary, blocker, next_action, started_at,
                  last_heartbeat_at, finished_at, stale_after_seconds,
                  created_at, updated_at
           FROM cooperative_runs WHERE id = ?`,
        )
        .get(value.id),
    ).toEqual({
      id: value.id,
      project_id: value.projectId,
      title: value.title,
      actor_label: value.actorLabel,
      origin: value.origin,
      status: "running",
      phase: value.phase,
      progress: 0,
      branch: value.branch,
      summary: value.summary,
      blocker: null,
      next_action: value.nextAction,
      started_at: now,
      last_heartbeat_at: now,
      finished_at: null,
      stale_after_seconds: 3_600,
      created_at: now,
      updated_at: now,
    });
    expect(
      database.$client
        .prepare(
          `SELECT id, run_id, sequence, kind, actor, source, summary,
                  before_json, after_json, occurred_at, idempotency_key,
                  correlation_id
           FROM cooperative_run_events WHERE id = ?`,
        )
        .get(registered.id),
    ).toEqual({
      id: registered.id,
      run_id: value.id,
      sequence: 1,
      kind: "run.registered",
      actor: registered.actor,
      source: registered.source,
      summary: registered.summary,
      before_json: null,
      after_json: JSON.stringify(value),
      occurred_at: now,
      idempotency_key: registered.idempotencyKey,
      correlation_id: registered.correlationId,
    });
    database.$client.close();
  });

  it("returns duplicate idempotently without writing another row", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteCooperativeRunRegistrationRepository(database);
    const value = run();
    const registered = event(value);

    await repository.register(value, registered);
    await expect(repository.register(value, registered)).resolves.toBe(
      "duplicate",
    );
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM cooperative_runs")
        .get(),
    ).toEqual({ count: 1 });
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM cooperative_run_events")
        .get(),
    ).toEqual({ count: 1 });
    database.$client.close();
  });

  it("rejects missing or archived projects before inserting the run", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteCooperativeRunRegistrationRepository(database);
    const missing = run("run-missing", "project-missing");

    await expect(repository.register(missing, event(missing))).resolves.toBe(
      "project_not_found",
    );

    database.$client
      .prepare("UPDATE projects SET status = 'archived' WHERE id = ?")
      .run("demo-project-platform");
    const archived = run("run-archived");
    await expect(repository.register(archived, event(archived))).resolves.toBe(
      "project_not_found",
    );
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM cooperative_runs")
        .get(),
    ).toEqual({ count: 0 });
    database.$client.close();
  });

  it("reports identity conflicts and rolls back when the event insert fails", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteCooperativeRunRegistrationRepository(database);
    const first = run();
    await repository.register(first, event(first));

    const idConflict = run(first.id, null);
    await expect(
      repository.register(
        idConflict,
        event(idConflict, {
          id: "run-event-id-conflict",
          idempotencyKey: "different-idempotency-key",
        }),
      ),
    ).resolves.toBe("conflict");

    const rollback = run("run-rollback", null);
    const conflictingEvent = event(rollback, {
      id: "run-event-1",
      idempotencyKey: "rollback-idempotency-key",
    });
    await expect(
      repository.register(rollback, conflictingEvent),
    ).rejects.toThrow();
    expect(
      database.$client
        .prepare("SELECT id FROM cooperative_runs WHERE id = ?")
        .get(rollback.id),
    ).toBeUndefined();
    database.$client.close();
  });
});
