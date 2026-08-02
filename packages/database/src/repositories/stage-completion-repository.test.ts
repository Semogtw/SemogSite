import { describe, expect, it } from "vitest";
import type {
  StageCompletionAuditEvent,
  StageSnapshot,
} from "@semogtw/domain";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteStageCompletionRepository } from "./stage-completion-repository";

const now = "2026-08-01T17:30:00.000Z";

function insertPassedEvidence(
  database: ReturnType<typeof createSqliteDatabase>,
): void {
  database.$client
    .prepare(
      `INSERT INTO evidence (
        id, project_id, stage_id, session_id, repository_id, kind, title,
        url, external_id, status, summary, occurred_at, captured_at,
        source_hash, data_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "evidence-stage-pass",
      "demo-project-platform",
      "demo-stage-database",
      null,
      null,
      "test",
      "Gate de banco",
      null,
      null,
      "passed",
      "Contrato observado.",
      now,
      now,
      null,
      "manual",
    );
}

function completedSnapshot(before: StageSnapshot): StageSnapshot {
  return {
    ...before,
    state: "completed",
    progress: 100,
    done: true,
    nextStep: null,
    blocker: null,
    manualLock: true,
    updatedAt: now,
  };
}

function auditFor(
  before: StageSnapshot,
  after: StageSnapshot,
  id = "audit-stage-complete",
): StageCompletionAuditEvent {
  return {
    id,
    actor: "semogtw-owner",
    action: "stage.complete",
    entityType: "stage",
    entityId: before.id,
    before,
    after,
    reason: "Gate final observado e evidência anexada.",
    occurredAt: now,
    source: "manual",
    confirmed: true,
    correlationId: "correlation-stage-complete",
  };
}

describe("SqliteStageCompletionRepository", () => {
  it("hydrates evidence and atomically completes the stage with audit", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertPassedEvidence(database);
    const repository = new SqliteStageCompletionRepository(database);

    const before = await repository.findById("demo-stage-database");
    expect(before).toMatchObject({
      id: "demo-stage-database",
      state: "in_progress",
      evidence: [{ id: "evidence-stage-pass", status: "passed" }],
    });

    const after = completedSnapshot(before!);
    const audit = auditFor(before!, after);
    await expect(
      repository.completeWithAudit(before!, after, audit),
    ).resolves.toBe(true);

    expect(
      database.$client
        .prepare(
          "SELECT state, progress, done, next_step, blocker, manual_lock, updated_from, updated_at FROM stages WHERE id = ?",
        )
        .get(before!.id),
    ).toEqual({
      state: "completed",
      progress: 100,
      done: 1,
      next_step: null,
      blocker: null,
      manual_lock: 1,
      updated_from: "manual",
      updated_at: now,
    });
    expect(
      database.$client
        .prepare("SELECT action, before_json, after_json FROM audit_events WHERE id = ?")
        .get(audit.id),
    ).toEqual({
      action: "stage.complete",
      before_json: JSON.stringify(before),
      after_json: JSON.stringify(after),
    });
  });

  it("returns a conflict and writes no audit for a stale snapshot", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertPassedEvidence(database);
    const repository = new SqliteStageCompletionRepository(database);
    const before = (await repository.findById("demo-stage-database"))!;

    database.$client
      .prepare("UPDATE stages SET updated_at = ? WHERE id = ?")
      .run("2026-08-01T17:10:00.000Z", before.id);

    const after = completedSnapshot(before);
    const audit = auditFor(before, after, "audit-stage-conflict");
    await expect(
      repository.completeWithAudit(before, after, audit),
    ).resolves.toBe(false);
    expect(
      database.$client
        .prepare("SELECT id FROM audit_events WHERE id = ?")
        .get(audit.id),
    ).toBeUndefined();
  });

  it("rolls back the stage update when audit insertion fails", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertPassedEvidence(database);
    const repository = new SqliteStageCompletionRepository(database);
    const before = (await repository.findById("demo-stage-database"))!;
    const after = completedSnapshot(before);
    const audit = auditFor(before, after, "audit-stage-duplicate");

    database.$client
      .prepare(
        `INSERT INTO audit_events (
          id, actor, action, entity_type, entity_id, before_json, after_json,
          reason, occurred_at, source, confirmed, correlation_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        audit.id,
        audit.actor,
        audit.action,
        audit.entityType,
        audit.entityId,
        JSON.stringify(audit.before),
        JSON.stringify(audit.after),
        audit.reason,
        audit.occurredAt,
        audit.source,
        1,
        audit.correlationId,
      );

    await expect(
      repository.completeWithAudit(before, after, audit),
    ).rejects.toThrow();
    expect(
      database.$client
        .prepare("SELECT state, progress, done, updated_at FROM stages WHERE id = ?")
        .get(before.id),
    ).toEqual({
      state: before.state,
      progress: before.progress,
      done: before.done ? 1 : 0,
      updated_at: before.updatedAt,
    });
  });
});
