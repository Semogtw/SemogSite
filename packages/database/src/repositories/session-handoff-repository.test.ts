import { describe, expect, it } from "vitest";
import type {
  RecordedDevelopmentSession,
  SessionHandoffAuditEvent,
} from "@semogtw/domain";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteSessionHandoffRepository } from "./session-handoff-repository";

const session: RecordedDevelopmentSession = {
  id: "session-1",
  projectId: null,
  title: "Continuidade da fundação",
  sessionDate: "2026-08-01T16:00:00.000Z",
  actor: "semogtw-owner",
  branch: "develop/foundation-bootstrap",
  commits: ["abcdef1", "1234567890abcdef"],
  completedSummary: "Ciclo de vida de atenção implementado.",
  testsStatus: "blocked",
  testsSummary: "Registry indisponível neste runtime.",
  blockers: "DNS para registry.npmjs.org indisponível.",
  nextStep: "Implementar persistência do handoff.",
  result: "significant",
  sourceUrl: null,
  automatic: false,
  sourceHash: null,
  source: "manual",
  createdAt: "2026-08-01T16:30:00.000Z",
  updatedAt: "2026-08-01T16:30:00.000Z",
};

const audit: SessionHandoffAuditEvent = {
  id: "audit-session-1",
  actor: "semogtw-owner",
  action: "development_session.create",
  entityType: "development_session",
  entityId: session.id,
  before: null,
  after: session,
  reason: "Registrar continuidade antes de ampliar a fase.",
  occurredAt: "2026-08-01T16:30:00.000Z",
  source: "manual",
  confirmed: true,
  correlationId: "correlation-session-1",
};

describe("SqliteSessionHandoffRepository", () => {
  it("inserts the session and audit event in one transaction", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteSessionHandoffRepository(database);

    await repository.insertSessionWithAudit(session, audit);

    expect(
      database.$client
        .prepare("SELECT * FROM development_sessions WHERE id = ?")
        .get(session.id),
    ).toMatchObject({
      id: "session-1",
      actor: "semogtw-owner",
      branch: "develop/foundation-bootstrap",
      commits_json: JSON.stringify(session.commits),
      tests_status: "blocked",
      automatic: 0,
      source_hash: null,
      data_source: "manual",
    });
    expect(
      database.$client
        .prepare("SELECT * FROM audit_events WHERE id = ?")
        .get(audit.id),
    ).toMatchObject({
      entity_type: "development_session",
      entity_id: "session-1",
      action: "development_session.create",
      after_json: JSON.stringify(session),
      confirmed: 1,
      correlation_id: "correlation-session-1",
    });
  });

  it("rolls back the session when the audit insert fails", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteSessionHandoffRepository(database);

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
      repository.insertSessionWithAudit(session, audit),
    ).rejects.toThrow();
    expect(
      database.$client
        .prepare("SELECT id FROM development_sessions WHERE id = ?")
        .get(session.id),
    ).toBeUndefined();
  });
});
