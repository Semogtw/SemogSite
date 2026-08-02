import { describe, expect, it } from "vitest";
import type {
  AttentionLifecycleAuditEvent,
  AttentionLifecycleSnapshot,
} from "@semogtw/domain";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteAttentionLifecycleRepository } from "./attention-lifecycle-repository";

const createdAt = "2026-08-01T13:30:00.000Z";
const updatedAt = "2026-08-01T15:30:00.000Z";

function seedAttention(database: ReturnType<typeof createSqliteDatabase>) {
  database.$client
    .prepare(
      `INSERT INTO attention_items (
        id, project_id, title, status, impact, type, owner, next_action,
        source_url, resolved_at, data_source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "attention-1",
      null,
      "Executar build integral",
      "open",
      "high",
      "local_test",
      "owner",
      "Rodar pnpm check em ambiente com registry completo.",
      null,
      null,
      "manual",
      createdAt,
      createdAt,
    );
}

describe("SqliteAttentionLifecycleRepository", () => {
  it("reads the canonical row and atomically resolves it with audit", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedAttention(database);
    const repository = new SqliteAttentionLifecycleRepository(database);

    const before = await repository.findById("attention-1");
    expect(before).toMatchObject({
      id: "attention-1",
      type: "critical_test",
      status: "open",
      source: "manual",
      resolvedAt: null,
    });

    const after: AttentionLifecycleSnapshot = {
      ...before!,
      status: "resolved",
      resolvedAt: updatedAt,
      updatedAt,
    };
    const audit: AttentionLifecycleAuditEvent = {
      id: "audit-2",
      actor: "semogtw-owner",
      action: "attention.resolve",
      entityType: "attention_item",
      entityId: after.id,
      before: before!,
      after,
      reason: "Gate executado e evidência registrada.",
      occurredAt: updatedAt,
      source: "manual",
      confirmed: true,
      correlationId: "correlation-2",
    };

    await expect(
      repository.transitionWithAudit(before!, after, audit),
    ).resolves.toBe(true);
    expect(
      database.$client
        .prepare("SELECT status, resolved_at, updated_at FROM attention_items WHERE id = ?")
        .get(after.id),
    ).toEqual({
      status: "resolved",
      resolved_at: updatedAt,
      updated_at: updatedAt,
    });
    expect(
      database.$client
        .prepare("SELECT action, before_json, after_json FROM audit_events WHERE id = ?")
        .get(audit.id),
    ).toMatchObject({
      action: "attention.resolve",
      before_json: JSON.stringify(before),
      after_json: JSON.stringify(after),
    });
  });

  it("returns a conflict and does not audit when the expected version is stale", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedAttention(database);
    const repository = new SqliteAttentionLifecycleRepository(database);
    const before = (await repository.findById("attention-1"))!;

    database.$client
      .prepare("UPDATE attention_items SET updated_at = ? WHERE id = ?")
      .run("2026-08-01T14:00:00.000Z", before.id);

    const after: AttentionLifecycleSnapshot = {
      ...before,
      status: "dismissed",
      resolvedAt: updatedAt,
      updatedAt,
    };
    const audit: AttentionLifecycleAuditEvent = {
      id: "audit-conflict",
      actor: "semogtw-owner",
      action: "attention.dismiss",
      entityType: "attention_item",
      entityId: before.id,
      before,
      after,
      reason: "Item não é mais relevante.",
      occurredAt: updatedAt,
      source: "manual",
      confirmed: true,
      correlationId: "correlation-conflict",
    };

    await expect(
      repository.transitionWithAudit(before, after, audit),
    ).resolves.toBe(false);
    expect(
      database.$client
        .prepare("SELECT id FROM audit_events WHERE id = ?")
        .get(audit.id),
    ).toBeUndefined();
  });
});
