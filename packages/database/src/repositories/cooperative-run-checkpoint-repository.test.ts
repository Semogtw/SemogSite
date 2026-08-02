import { describe, expect, it } from "vitest";
import type {
  CooperativeRunCheckpoint,
  CooperativeRunCheckpointEvent,
  CooperativeRunRegistrationEvent,
  CooperativeRunSnapshot,
} from "@semogtw/domain";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteCooperativeRunCheckpointRepository } from "./cooperative-run-checkpoint-repository";
import { SqliteCooperativeRunRegistrationRepository } from "./cooperative-run-registration-repository";

const startedAt = "2026-08-01T20:00:00.000Z";
const capturedAt = "2026-08-01T21:00:00.000Z";

function running(): CooperativeRunSnapshot {
  return {
    id: "run-1",
    projectId: "demo-project-platform",
    title: "Foundation implementation",
    actorLabel: "ChatGPT",
    origin: "chatgpt",
    status: "running",
    phase: "Run ledger",
    progress: 40,
    branch: "develop/foundation-bootstrap",
    summary: "Run state implemented.",
    blocker: null,
    nextAction: "Persist checkpoints.",
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
  const value = running();
  const event: CooperativeRunRegistrationEvent = {
    id: "event-1",
    runId: value.id,
    kind: "run.registered",
    actor: "semogtw-owner",
    summary: value.summary,
    occurredAt: startedAt,
    source: "manual",
    idempotencyKey: "register-1",
    correlationId: "correlation-register-1",
  };
  await new SqliteCooperativeRunRegistrationRepository(database).register(
    value,
    event,
  );
  return value;
}

function after(before: CooperativeRunSnapshot): CooperativeRunSnapshot {
  return {
    ...before,
    phase: "SQLite ledger",
    progress: 55,
    summary: "Checkpoint persisted.",
    nextAction: "Run focused tests.",
    lastHeartbeatAt: capturedAt,
    updatedAt: capturedAt,
  };
}

function event(
  before: CooperativeRunSnapshot,
  value: CooperativeRunSnapshot,
): CooperativeRunCheckpointEvent {
  return {
    id: "event-2",
    runId: before.id,
    kind: "run.checkpoint",
    actor: "semogtw-owner",
    source: "chatgpt",
    summary: value.summary,
    before,
    after: value,
    occurredAt: capturedAt,
    idempotencyKey: "checkpoint-event-1",
    correlationId: "correlation-checkpoint-1",
  };
}

function checkpoint(value: CooperativeRunSnapshot): CooperativeRunCheckpoint {
  return {
    id: "checkpoint-1",
    runId: value.id,
    eventId: "event-2",
    phase: value.phase,
    progress: value.progress,
    branch: value.branch,
    summary: value.summary,
    commits: ["abcdef123", "1234567"],
    testsStatus: "not_run",
    testsSummary: "Dependencies unavailable.",
    blockers: "Registry DNS unavailable.",
    nextStep: value.nextAction!,
    capturedAt,
    sourceHash: "checkpoint-source-hash-1",
  };
}

describe("SqliteCooperativeRunCheckpointRepository", () => {
  it("updates the run and inserts event/checkpoint atomically", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const before = await seed(database);
    const value = after(before);
    const eventValue = event(before, value);
    const checkpointValue = checkpoint(value);
    const repository = new SqliteCooperativeRunCheckpointRepository(database);

    await expect(
      repository.record(before, value, eventValue, checkpointValue),
    ).resolves.toBe("recorded");

    expect(
      database.$client
        .prepare(
          `SELECT progress, phase, summary, next_action, last_heartbeat_at,
                  updated_at
           FROM cooperative_runs WHERE id = ?`,
        )
        .get(before.id),
    ).toEqual({
      progress: 55,
      phase: "SQLite ledger",
      summary: "Checkpoint persisted.",
      next_action: "Run focused tests.",
      last_heartbeat_at: capturedAt,
      updated_at: capturedAt,
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
      kind: "run.checkpoint",
      before_json: JSON.stringify(before),
      after_json: JSON.stringify(value),
    });
    expect(
      database.$client
        .prepare(
          `SELECT event_id, sequence, phase, progress, branch, summary,
                  commits_json, tests_status, tests_summary, blockers,
                  next_step, captured_at, source_hash
           FROM cooperative_run_checkpoints WHERE id = ?`,
        )
        .get(checkpointValue.id),
    ).toEqual({
      event_id: eventValue.id,
      sequence: 1,
      phase: "SQLite ledger",
      progress: 55,
      branch: value.branch,
      summary: value.summary,
      commits_json: JSON.stringify(checkpointValue.commits),
      tests_status: "not_run",
      tests_summary: checkpointValue.testsSummary,
      blockers: checkpointValue.blockers,
      next_step: checkpointValue.nextStep,
      captured_at: capturedAt,
      source_hash: checkpointValue.sourceHash,
    });
    database.$client.close();
  });

  it("returns duplicate only when both event and checkpoint payloads match", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const before = await seed(database);
    const value = after(before);
    const eventValue = event(before, value);
    const checkpointValue = checkpoint(value);
    const repository = new SqliteCooperativeRunCheckpointRepository(database);

    await repository.record(before, value, eventValue, checkpointValue);
    await expect(
      repository.record(before, value, eventValue, checkpointValue),
    ).resolves.toBe("duplicate");
    await expect(
      repository.record(
        before,
        value,
        eventValue,
        { ...checkpointValue, testsStatus: "passed" },
      ),
    ).resolves.toBe("conflict");
    database.$client.close();
  });

  it("rejects stale state and conflicting source hashes without partial writes", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const before = await seed(database);
    const value = after(before);
    const repository = new SqliteCooperativeRunCheckpointRepository(database);

    database.$client
      .prepare("UPDATE cooperative_runs SET updated_at = ? WHERE id = ?")
      .run("2026-08-01T20:30:00.000Z", before.id);
    await expect(
      repository.record(before, value, event(before, value), checkpoint(value)),
    ).resolves.toBe("conflict");
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM cooperative_run_events")
        .get(),
    ).toEqual({ count: 1 });

    database.$client
      .prepare("UPDATE cooperative_runs SET updated_at = ? WHERE id = ?")
      .run(before.updatedAt, before.id);
    const firstEvent = event(before, value);
    const firstCheckpoint = checkpoint(value);
    await repository.record(before, value, firstEvent, firstCheckpoint);

    const secondRun = {
      ...before,
      id: "run-2",
      projectId: null,
      updatedAt: startedAt,
    };
    const registration: CooperativeRunRegistrationEvent = {
      id: "event-run-2",
      runId: secondRun.id,
      kind: "run.registered",
      actor: "semogtw-owner",
      summary: secondRun.summary,
      occurredAt: startedAt,
      source: "manual",
      idempotencyKey: "register-run-2",
      correlationId: "correlation-run-2",
    };
    await new SqliteCooperativeRunRegistrationRepository(database).register(
      secondRun,
      registration,
    );
    const secondAfter = after(secondRun);
    await expect(
      repository.record(
        secondRun,
        secondAfter,
        {
          ...event(secondRun, secondAfter),
          id: "event-run-2-checkpoint",
          runId: secondRun.id,
          before: secondRun,
          after: secondAfter,
          idempotencyKey: "checkpoint-run-2",
        },
        {
          ...checkpoint(secondAfter),
          id: "checkpoint-run-2",
          runId: secondRun.id,
          eventId: "event-run-2-checkpoint",
        },
      ),
    ).resolves.toBe("conflict");
    expect(
      database.$client
        .prepare("SELECT updated_at FROM cooperative_runs WHERE id = ?")
        .get(secondRun.id),
    ).toEqual({ updated_at: startedAt });
    database.$client.close();
  });

  it("rolls back the run update when event insertion fails", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const before = await seed(database);
    const value = after(before);
    const eventValue = { ...event(before, value), id: "event-1" };
    const repository = new SqliteCooperativeRunCheckpointRepository(database);

    await expect(
      repository.record(before, value, eventValue, {
        ...checkpoint(value),
        eventId: eventValue.id,
      }),
    ).rejects.toThrow();
    expect(
      database.$client
        .prepare("SELECT progress, updated_at FROM cooperative_runs WHERE id = ?")
        .get(before.id),
    ).toEqual({ progress: 40, updated_at: startedAt });
    database.$client.close();
  });
});
