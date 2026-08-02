import { describe, expect, it } from "vitest";
import type {
  CooperativeRunCommand,
  CooperativeRunCommandLifecycleSnapshot,
  CooperativeRunCommandQueuedEvent,
  CooperativeRunCommandTransitionEvent,
  CooperativeRunRegistrationEvent,
  CooperativeRunSnapshot,
} from "@semogtw/domain";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteCooperativeRunCommandQueueRepository } from "./cooperative-run-command-queue-repository";
import { SqliteCooperativeRunCommandTransitionRepository } from "./cooperative-run-command-transition-repository";
import { SqliteCooperativeRunRegistrationRepository } from "./cooperative-run-registration-repository";

const startedAt = "2026-08-01T20:00:00.000Z";
const queuedAt = "2026-08-01T22:00:00.000Z";
const transitionedAt = "2026-08-01T22:10:00.000Z";

function run(): CooperativeRunSnapshot {
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
    summary: "Command queue ready.",
    blocker: null,
    nextAction: "Acknowledge commands.",
    startedAt,
    lastHeartbeatAt: startedAt,
    finishedAt: null,
    staleAfterSeconds: 3_600,
    updatedAt: startedAt,
  };
}

function queuedCommand(): CooperativeRunCommand {
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

async function seed(
  database: ReturnType<typeof createSqliteDatabase>,
): Promise<CooperativeRunCommandLifecycleSnapshot> {
  const runValue = run();
  const registration: CooperativeRunRegistrationEvent = {
    id: "event-register",
    runId: runValue.id,
    kind: "run.registered",
    actor: "semogtw-owner",
    source: "manual",
    summary: runValue.summary,
    occurredAt: startedAt,
    idempotencyKey: "register-run-1",
    correlationId: "correlation-register-run-1",
  };
  await new SqliteCooperativeRunRegistrationRepository(database).register(
    runValue,
    registration,
  );

  const command = queuedCommand();
  const queuedEvent: CooperativeRunCommandQueuedEvent = {
    id: "event-command-queued",
    runId: command.runId,
    kind: "run.command_queued",
    actor: command.queuedBy,
    source: "manual",
    summary: command.summary,
    command,
    occurredAt: command.queuedAt,
    idempotencyKey: command.idempotencyKey,
    correlationId: command.correlationId,
  };
  await new SqliteCooperativeRunCommandQueueRepository(database).queue(
    runValue,
    command,
    queuedEvent,
  );
  return command;
}

function acknowledged(
  before: CooperativeRunCommandLifecycleSnapshot,
): CooperativeRunCommandLifecycleSnapshot {
  return {
    ...before,
    status: "acknowledged",
    acknowledgedAt: transitionedAt,
    updatedAt: transitionedAt,
  };
}

function event(
  before: CooperativeRunCommandLifecycleSnapshot,
  after: CooperativeRunCommandLifecycleSnapshot,
): CooperativeRunCommandTransitionEvent {
  return {
    id: "event-command-acknowledged",
    runId: before.runId,
    commandId: before.id,
    kind: "run.command_acknowledged",
    actor: "chatgpt-agent",
    source: "chatgpt",
    summary: "Command acknowledged.",
    before,
    after,
    occurredAt: transitionedAt,
    idempotencyKey: "transition-key-1",
    correlationId: "correlation-transition-1",
  };
}

describe("SqliteCooperativeRunCommandTransitionRepository", () => {
  it("updates the command and appends an immutable event atomically", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const before = await seed(database);
    const after = acknowledged(before);
    const eventValue = event(before, after);
    const repository = new SqliteCooperativeRunCommandTransitionRepository(
      database,
    );

    await expect(repository.apply(before, after, eventValue)).resolves.toBe(
      "updated",
    );
    expect(
      database.$client
        .prepare(
          `SELECT status, reason, acknowledged_at, completed_at, updated_at
           FROM cooperative_run_commands WHERE id = ?`,
        )
        .get(before.id),
    ).toEqual({
      status: "acknowledged",
      reason: null,
      acknowledged_at: transitionedAt,
      completed_at: null,
      updated_at: transitionedAt,
    });
    expect(
      database.$client
        .prepare(
          `SELECT sequence, kind, before_json, after_json
           FROM cooperative_run_events WHERE id = ?`,
        )
        .get(eventValue.id),
    ).toEqual({
      sequence: 3,
      kind: "run.command_acknowledged",
      before_json: JSON.stringify(before),
      after_json: JSON.stringify(after),
    });
    database.$client.close();
  });

  it("returns duplicate only for the same event and resulting command", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const before = await seed(database);
    const after = acknowledged(before);
    const eventValue = event(before, after);
    const repository = new SqliteCooperativeRunCommandTransitionRepository(
      database,
    );

    await repository.apply(before, after, eventValue);
    await expect(repository.apply(before, after, eventValue)).resolves.toBe(
      "duplicate",
    );
    await expect(
      repository.apply(before, after, {
        ...eventValue,
        summary: "Changed event.",
      }),
    ).resolves.toBe("conflict");
    database.$client.close();
  });

  it("rejects stale command state without appending an event", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const before = await seed(database);
    const after = acknowledged(before);
    const repository = new SqliteCooperativeRunCommandTransitionRepository(
      database,
    );

    database.$client
      .prepare(
        "UPDATE cooperative_run_commands SET updated_at = ? WHERE id = ?",
      )
      .run("2026-08-01T22:05:00.000Z", before.id);
    await expect(repository.apply(before, after, event(before, after))).resolves.toBe(
      "conflict",
    );
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM cooperative_run_events")
        .get(),
    ).toEqual({ count: 2 });
    database.$client.close();
  });

  it("rolls back the command update when event insertion fails", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const before = await seed(database);
    const after = acknowledged(before);
    const repository = new SqliteCooperativeRunCommandTransitionRepository(
      database,
    );

    await expect(
      repository.apply(before, after, {
        ...event(before, after),
        id: "event-register",
      }),
    ).rejects.toThrow();
    expect(
      database.$client
        .prepare("SELECT status, updated_at FROM cooperative_run_commands")
        .get(),
    ).toEqual({ status: "queued", updated_at: queuedAt });
    database.$client.close();
  });
});
