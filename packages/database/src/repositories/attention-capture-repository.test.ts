import { describe, expect, it } from "vitest";
import type {
  CaptureAuditEvent,
  CapturedAttention,
} from "@semogtw/domain";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteAttentionCaptureRepository } from "./attention-capture-repository";

const attention: CapturedAttention = {
  id: "attention-1",
  projectId: null,
  type: "risk",
  status: "open",
  impact: "high",
  title: "Executar build integral",
  owner: "owner",
  nextAction: "Rodar pnpm check em ambiente com registry completo.",
  source: "manual",
  createdAt: "2026-08-01T13:30:00.000Z",
  updatedAt: "2026-08-01T13:30:00.000Z",
};

const audit: CaptureAuditEvent = {
  id: "audit-1",
  actor: "semogtw-owner",
  action: "attention.create",
  entityType: "attention_item",
  entityId: attention.id,
  before: null,
  after: attention,
  reason: "Registrar gate externo sem marcar como concluído.",
  occurredAt: "2026-08-01T13:30:00.000Z",
  source: "manual",
  confirmed: true,
  correlationId: "correlation-1",
};

describe("SqliteAttentionCaptureRepository", () => {
  it("inserts the attention item and audit event in one transaction", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteAttentionCaptureRepository(database);

    await repository.insertAttentionWithAudit(attention, audit);

    expect(
      database.$client
        .prepare("SELECT * FROM attention_items WHERE id = ?")
        .get(attention.id),
    ).toMatchObject({
      id: "attention-1",
      status: "open",
      source: "manual",
    });
    expect(
      database.$client
        .prepare("SELECT * FROM audit_events WHERE id = ?")
        .get(audit.id),
    ).toMatchObject({
      entity_id: "attention-1",
      action: "attention.create",
      confirmed: 1,
      correlation_id: "correlation-1",
    });
  });

  it("rolls back the attention insert when the audit insert fails", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteAttentionCaptureRepository(database);

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
      repository.insertAttentionWithAudit(attention, audit),
    ).rejects.toThrow();
    expect(
      database.$client
        .prepare("SELECT id FROM attention_items WHERE id = ?")
        .get(attention.id),
    ).toBeUndefined();
  });
});
