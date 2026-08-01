import { describe, expect, it } from "vitest";
import type { EvidenceAuditEvent, RecordedEvidence } from "@semogtw/domain";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteEvidenceWriteRepository } from "./evidence-write-repository";

const evidence: RecordedEvidence = {
  id: "evidence-manual-1",
  projectId: "demo-project-platform",
  stageId: "demo-stage-database",
  sessionId: null,
  repositoryId: null,
  kind: "test",
  title: "Vitest do domínio",
  url: "https://github.com/Semogtw/SemogSite/actions/runs/1",
  externalId: "run-1",
  status: "passed",
  summary: "12 testes aprovados.",
  occurredAt: "2026-08-01T16:58:00.000Z",
  capturedAt: "2026-08-01T17:00:00.000Z",
  sourceHash: null,
  source: "manual",
};

const audit: EvidenceAuditEvent = {
  id: "audit-evidence-1",
  actor: "semogtw-owner",
  action: "evidence.create",
  entityType: "evidence",
  entityId: evidence.id,
  before: null,
  after: evidence,
  reason: "Registrar evidência observada da validação.",
  occurredAt: "2026-08-01T17:00:00.000Z",
  source: "manual",
  confirmed: true,
  correlationId: "correlation-evidence-1",
};

describe("SqliteEvidenceWriteRepository", () => {
  it("inserts evidence and audit in one transaction", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteEvidenceWriteRepository(database);

    await repository.insertEvidenceWithAudit(evidence, audit);

    expect(
      database.$client
        .prepare("SELECT * FROM evidence WHERE id = ?")
        .get(evidence.id),
    ).toMatchObject({
      id: "evidence-manual-1",
      project_id: "demo-project-platform",
      stage_id: "demo-stage-database",
      kind: "test",
      status: "passed",
      external_id: "run-1",
      data_source: "manual",
    });
    expect(
      database.$client
        .prepare("SELECT * FROM audit_events WHERE id = ?")
        .get(audit.id),
    ).toMatchObject({
      entity_type: "evidence",
      entity_id: "evidence-manual-1",
      action: "evidence.create",
      after_json: JSON.stringify(evidence),
      confirmed: 1,
      correlation_id: "correlation-evidence-1",
    });
  });

  it("rolls back evidence when audit insertion fails", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteEvidenceWriteRepository(database);

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
        null,
        JSON.stringify(audit.after),
        audit.reason,
        audit.occurredAt,
        audit.source,
        1,
        audit.correlationId,
      );

    await expect(
      repository.insertEvidenceWithAudit(evidence, audit),
    ).rejects.toThrow();
    expect(
      database.$client
        .prepare("SELECT id FROM evidence WHERE id = ?")
        .get(evidence.id),
    ).toBeUndefined();
  });
});
