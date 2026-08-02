import { describe, expect, it } from "vitest";
import type {
  CooperativeRunEvent,
  CooperativeRunRegistrationEvent,
  CooperativeRunSnapshot,
} from "@semogtw/domain";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteCooperativeRunRegistrationRepository } from "./cooperative-run-registration-repository";
import { SqliteCooperativeRunTransitionRepository } from "./cooperative-run-transition-repository";

const startedAt = "2026-08-01T20:00:00.000Z";
const updatedAt = "2026-08-01T20:30:00.000Z";

function running(): CooperativeRunSnapshot {
  return {
    id: "run-1",
    projectId: "demo-project-platform",
    title: "Foundation implementation",
    actorLabel: "ChatGPT",
    origin: "chatgpt",
    status: "running",
    phase: "MCP hardening",
    progress: 40,
    branch: "develop/foundation-bootstrap",
    summary: "Read adapter implemented.",
    blocker: null,
    nextAction: "Run dependency-complete tests.",
    startedAt,
    lastHeartbeatAt: startedAt,
    finishedAt: null,
    staleAfterSeconds: 3_600,
    updatedAt: startedAt,
  };
}

function registrationEvent(
  run: CooperativeRunSnapshot,
): CooperativeRunRegistrationEvent {
  return {
    id: "event-1",
    runId: run.id,
    kind: "run.registered",
    actor: "semogtw-owner",
    summary: run.summary,
    occurredAt: startedAt,
    source: "manual",
    idempotencyKey: "register-1",
    correlationId: "correlation-register-1",
  };
}

function checkpointEvent(
  before: CooperativeRunSnapshot,
  after: CooperativeRunSnapshot,
  overrides: Partial<CooperativeRunEvent> = {},
): CooperativeRunEvent {
  return {
    id: "event-2",
    runId: before.id,
    kind: "run.checkpoint",
    actor: "semogtw-owner",
    source: "manual",
    summary: after.summary,
    before,
    after,
    occurredAt: after.updatedAt,
    idempotencyKey: "checkpoint-2",
    correlationId: "correlation-checkpoint-2",
    ...overrides,
  };
}

async function seed(
  database: ReturnType<typeof createSqliteDatabase>,
): Promise<CooperativeRunSnapshot> {
  const value = running();
  const repository = new SqliteCooperativeRunRegistrationRepository(database);
  await repository.register(value, registrationEvent(value));
  return value;
}

describe("SqliteCooperativeRunTransitionRepository", () => {
  it("hydrates the canonical snapshot", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const value = await seed(database);
    const repository = new SqliteCooperativeRunTransitionRepository(database);

    await expect(repository.findRun(value.id)).resolves.toEqual(value);
    await expect(repository.findRun("missing")).resolves.toBeNull();
    database.$client.close();
  });

  it("updates the run and appends the next immutable event atomically", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const before = await seed(database);
    const after: CooperativeRunSnapshot = {
      ...before,
      progress: 55,
      summary: "Static verification completed.",
      nextAction: "Install and run SDK-backed tests.",
      lastHeartbeatAt: updatedAt,
      updatedAt,
    };
    const event = checkpointEvent(before, after);
    const repository = new SqliteCooperativeRunTransitionRepository(database);

    await expect(repository.apply(before, after, event)).resolves.toBe(
      "updated",
    );
    expect(
      database.$client
        .prepare(
          `SELECT status, progress, summary, next_action, last_heartbeat_at,
                  updated_at
           FROM cooperative_runs WHERE id = ?`,
        )
        .get(before.id),
    ).toEqual({
      status: "running",
      progress: 55,
      summary: after.summary,
      next_action: after.nextAction,
      last_heartbeat_at: updatedAt,
      updated_at: updatedAt,
    });
    expect(
      database.$client
        .prepare(
          `SELECT sequence, kind, before_json, after_json, idempotency_key
           FROM cooperative_run_events WHERE id = ?`,
        )
        .get(event.id),
    ).toEqual({
      sequence: 2,
      kind: "run.checkpoint",
      before_json: JSON.stringify(before),
      after_json: JSON.stringify(after),
      idempotency_key: event.idempotencyKey,
    });
    database.$client.close();
  });

  it("returns duplicate only for the same idempotent payload", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const before = await seed(database);
    const after: CooperativeRunSnapshot = {
      ...before,
      summary: "Heartbeat recorded.",
      lastHeartbeatAt: updatedAt,
      updatedAt,
    };
    const event = checkpointEvent(before, after, {
      kind: "run.heartbeat",
      summary: after.summary,
      idempotencyKey: "heartbeat-2",
    });
    const repository = new SqliteCooperativeRunTransitionRepository(database);

    await repository.apply(before, after, event);
    await expect(repository.apply(before, after, event)).resolves.toBe(
      "duplicate",
    );
    await expect(
      repository.apply(
        before,
        { ...after, summary: "Different payload." },
        {
          ...event,
          summary: "Different payload.",
          after: { ...after, summary: "Different payload." },
        },
      ),
    ).resolves.toBe("conflict");
    database.$client.close();
  });

  it("rejects stale state without an event and rolls back on event failure", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const before = await seed(database);
    const after: CooperativeRunSnapshot = {
      ...before,
      summary: "Updated.",
      lastHeartbeatAt: updatedAt,
      updatedAt,
    };
    const repository = new SqliteCooperativeRunTransitionRepository(database);
    database.$client
      .prepare("UPDATE cooperative_runs SET updated_at = ? WHERE id = ?")
      .run("2026-08-01T20:10:00.000Z", before.id);

    await expect(
      repository.apply(before, after, checkpointEvent(before, after)),
    ).resolves.toBe("conflict");
    expect(
      database.$client
        .prepare("SELECT id FROM cooperative_run_events WHERE id = 'event-2'")
        .get(),
    ).toBeUndefined();

    database.$client
      .prepare("UPDATE cooperative_runs SET updated_at = ? WHERE id = ?")
      .run(before.updatedAt, before.id);
    const conflictingEvent = checkpointEvent(before, after, {
      id: "event-1",
      idempotencyKey: "new-event-key",
    });
    await expect(
      repository.apply(before, after, conflictingEvent),
    ).rejects.toThrow();
    expect(
      database.$client
        .prepare(
          "SELECT progress, summary, updated_at FROM cooperative_runs WHERE id = ?",
        )
        .get(before.id),
    ).toEqual({
      progress: before.progress,
      summary: before.summary,
      updated_at: before.updatedAt,
    });
    database.$client.close();
  });
});
