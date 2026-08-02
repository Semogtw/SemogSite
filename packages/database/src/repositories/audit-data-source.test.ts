import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteAuditDataSource } from "./audit-data-source";

function insertAudit(
  database: ReturnType<typeof createSqliteDatabase>,
  input: {
    id: string;
    action: string;
    entityType: string;
    occurredAt: string;
    beforeJson?: string | null;
    afterJson?: string | null;
  },
): void {
  database.$client
    .prepare(
      `INSERT INTO audit_events (
        id, actor, action, entity_type, entity_id, before_json, after_json,
        reason, occurred_at, source, confirmed, correlation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.id,
      "semogtw-owner",
      input.action,
      input.entityType,
      `${input.entityType}-1`,
      input.beforeJson ?? null,
      input.afterJson ?? JSON.stringify({ id: `${input.entityType}-1` }),
      `Razão ${input.id}`,
      input.occurredAt,
      "manual",
      1,
      `correlation-${input.id}`,
    );
}

describe("SqliteAuditDataSource", () => {
  it("returns newest-first paginated audit records", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertAudit(database, {
      id: "audit-1",
      action: "attention.create",
      entityType: "attention_item",
      occurredAt: "2026-08-01T15:00:00.000Z",
    });
    insertAudit(database, {
      id: "audit-2",
      action: "evidence.create",
      entityType: "evidence",
      occurredAt: "2026-08-01T16:00:00.000Z",
    });
    insertAudit(database, {
      id: "audit-3",
      action: "stage.complete",
      entityType: "stage",
      occurredAt: "2026-08-01T17:00:00.000Z",
    });
    const source = new SqliteAuditDataSource(database);

    await expect(source.list({ page: 1, pageSize: 2 })).resolves.toMatchObject({
      page: 1,
      pageSize: 2,
      total: 3,
      totalPages: 2,
      items: [
        { id: "audit-3", action: "stage.complete" },
        { id: "audit-2", action: "evidence.create" },
      ],
    });
  });

  it("applies exact action and entity-type filters", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertAudit(database, {
      id: "audit-attention",
      action: "attention.create",
      entityType: "attention_item",
      occurredAt: "2026-08-01T15:00:00.000Z",
    });
    insertAudit(database, {
      id: "audit-evidence",
      action: "evidence.create",
      entityType: "evidence",
      occurredAt: "2026-08-01T16:00:00.000Z",
    });
    const source = new SqliteAuditDataSource(database);

    const page = await source.list({
      page: 1,
      pageSize: 20,
      action: "evidence.create",
      entityType: "evidence",
    });

    expect(page.total).toBe(1);
    expect(page.items).toEqual([
      expect.objectContaining({
        id: "audit-evidence",
        action: "evidence.create",
        entityType: "evidence",
      }),
    ]);
  });

  it("preserves nullable reasons from historical audit rows", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    database.$client
      .prepare(
        `INSERT INTO audit_events (
          id, actor, action, entity_type, entity_id, before_json, after_json,
          reason, occurred_at, source, confirmed, correlation_id
        ) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?, ?, ?)`,
      )
      .run(
        "audit-no-reason",
        "migration",
        "legacy.import",
        "legacy_record",
        "legacy-1",
        "2026-08-01T13:00:00.000Z",
        "migration",
        1,
        "correlation-audit-no-reason",
      );
    const source = new SqliteAuditDataSource(database);

    const page = await source.list({ page: 1, pageSize: 20 });

    expect(page.items[0]).toMatchObject({
      id: "audit-no-reason",
      reason: null,
    });
    database.$client.close();
  });

  it("marks malformed historical JSON without crashing the page", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertAudit(database, {
      id: "audit-malformed",
      action: "legacy.import",
      entityType: "legacy_record",
      occurredAt: "2026-08-01T14:00:00.000Z",
      beforeJson: "{broken",
      afterJson: JSON.stringify({ ok: true }),
    });
    const source = new SqliteAuditDataSource(database);

    const page = await source.list({ page: 1, pageSize: 20 });

    expect(page.items[0]).toMatchObject({
      id: "audit-malformed",
      before: null,
      after: { ok: true },
      malformedJson: ["before"],
    });
  });
});
