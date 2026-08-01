import { describe, expect, it } from "vitest";
import type {
  CooperativeRunCommand,
  CooperativeRunCommandQueuedEvent,
  CooperativeRunRegistrationEvent,
  CooperativeRunSnapshot,
} from "@semogtw/domain";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteCooperativeRunCommandQueueRepository } from "./cooperative-run-command-queue-repository";
import { SqliteCooperativeRunRegistrationRepository } from "./cooperative-run-registration-repository";

const startedAt = "2026-08-01T20:00:00.000Z";
const queuedAt = "2026-08-01T22:00:00.000Z";

function running(): CooperativeRunSnapshot {
  return {
    id: "run-1",
    projectId: "demo-project-platform",
    title: "Foundation implementation",
    actorLabel: "ChatGPT",
    origin: "chatgpt",
    status: "running",
    phase: "Run ledger",
    progress: 60,
    branch: "develop/foundation-bootstrap",
    summary: "Checkpoint persistence complete.",
    blocker: null,
    nextAction: "Queue owner commands.",
    startedAt,
    lastHeartbeatAt: startedAt,
    finishedAt: null,
    staleAfterSeconds: 3_600,
    updatedAt: startedAt,
  };
}

async function seed(
  database: ReturnType<typeof createSqliteDatabase>,
): Promise<CooperativeRunSnapshot> {
  const run = running();
  const event: CooperativeRunRegistrationEvent = {
    id: "event-register",
    runId: run.id,
    kind: "run.registered",
    actor: "semogtw-owner",
    source: "manual",
    summary: run.summary,
    occurredAt: startedAt,
    idempotencyKey: "register-run-1",
    correlationId: "correlation-register-run-1",
  };
  await new SqliteCooperativeRunRegistrationRepository(database).register(
    run,
    event,
  );
  return run;
}

function command(): CooperativeRunCommand {
  return {
    id: "command-1",
    runId: "run-1",
    kind: "request_checkpoint",
    status: "queued",
    summary: "Send a checkpoint.",
    payload: { include: ["commits", "tests"] },
    reason: null,
    queuedBy: "semogtw-owner",
    idempotencyKey: "command-key-1",
    correlationId: "correlation-command-1",
    queuedAt,
    acknowledgedAt: null,
    completedAt: null,
    expiresAt: "2026-08-02T02:00:00.000Z",
    updatedAt: queuedAt,
  };
}

function event(value: CooperativeRunCommand): CooperativeRunCommandQueuedEvent {
  return {
    id: "event-command-1",
    runId: value.runId,
    kind: "run.command_queued",
    actor: value.queuedBy,
    source: "manual",
    summary: value.summary,
    command: value,
    occurredAt: value.queuedAt,
    idempotencyKey: value.idempotencyKey,
    correlationId: value.correlationId,
  };
}

describe("SqliteCooperativeRunCommandQueueRepository", () => {
  it("inserts command and immutable event atomically", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const run = await seed(database);
    const value = command();
    const eventValue = event(value);
    const repository = new SqliteCooperativeRunCommandQueueRepository(database);

    await expect(repository.queue(run, value, eventValue)).resolves.toBe(
      "queued",
    );

    expect(
      database.$client
        .prepare(
          `SELECT kind, status, summary, payload_json, reason, queued_by,
                  correlation_id, queued_at, acknowledged_at, completed_at,
                  expires_at, updated_at
           FROM cooperative_run_commands WHERE id = ?`,
        )
        .get(value.id),
    ).toEqual({
      kind: "request_checkpoint",
      status: "queued",
      summary: value.summary,
      payload_json: JSON.stringify(value.payload),
      reason: null,
      queued_by: value.queuedBy,
      correlation_id: value.correlationId,
      queued_at: queuedAt,
      acknowledged_at: null,
      completed_at: null,
      expires_at: value.expiresAt,
      updated_at: queuedAt,
    });
    expect(
      database.$client
        .prepare(
          `SELECT sequence, kind, before_json, after_json
           FROM cooperative_run_events WHERE id = ?`,
        )
        .get(eventValue.id),
    ).toEqual({
      sequence: 2,
      kind: "run.command_queued",
      before_json: null,
      after_json: JSON.stringify(value),
    });
    database.$client.close();
  });

  it("returns duplicate only when command and event payloads both match", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const run = await seed(database);
    const value = command();
    const eventValue = event(value);
    const repository = new SqliteCooperativeRunCommandQueueRepository(database);

    await repository.queue(run, value, eventValue);
    await expect(repository.queue(run, value, eventValue)).resolves.toBe(
      "duplicate",
    );
    await expect(
      repository.queue(
        run,
        { ...value, summary: "Changed command." },
        { ...eventValue, summary: "Changed command." },
      ),
    ).resolves.toBe("conflict");
    database.$client.close();
  });

  it("rejects stale or terminal run snapshots without partial writes", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const run = await seed(database);
    const repository = new SqliteCooperativeRunCommandQueueRepository(database);

    database.$client
      .prepare("UPDATE cooperative_runs SET updated_at = ? WHERE id = ?")
      .run("2026-08-01T21:00:00.000Z", run.id);
    await expect(repository.queue(run, command(), event(command()))).resolves.toBe(
      "conflict",
    );

    database.$client
      .prepare(
        `UPDATE cooperative_runs
         SET status = 'completed', progress = 100, next_action = NULL,
             finished_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(queuedAt, queuedAt, run.id);
    const terminal = {
      ...run,
      status: "completed" as const,
      progress: 100,
      nextAction: null,
      finishedAt: queuedAt,
      updatedAt: queuedAt,
    };
    await expect(
      repository.queue(terminal, command(), event(command())),
    ).resolves.toBe("conflict");
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM cooperative_run_commands")
        .get(),
    ).toEqual({ count: 0 });
    database.$client.close();
  });

  it("rolls back command insertion when event insertion fails", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const run = await seed(database);
    const value = command();
    const repository = new SqliteCooperativeRunCommandQueueRepository(database);

    await expect(
      repository.queue(run, value, {
        ...event(value),
        id: "event-register",
      }),
    ).rejects.toThrow();
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM cooperative_run_commands")
        .get(),
    ).toEqual({ count: 0 });
    database.$client.close();
  });
});
