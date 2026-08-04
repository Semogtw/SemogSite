import { describe, expect, it } from "vitest";
import {
  planAttentionLifecycleTransition,
  validateAttentionLifecycleTransition,
} from "@semogtw/domain/attention";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteAttentionLifecycleRepository } from "./attention-lifecycle-repository";

function seedAttention(database: ReturnType<typeof createSqliteDatabase>): void {
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
      "Rodar pnpm check.",
      null,
      null,
      "manual",
      "2026-08-04T05:00:00.000Z",
      "2026-08-04T05:00:00.000Z",
    );
}

describe("SqliteAttentionLifecycleRepository synchronous command path", () => {
  it("reads and persists the same planned transition without opening another transaction", () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    seedAttention(database);
    const repository = new SqliteAttentionLifecycleRepository(database);
    const before = repository.findByIdSync("attention-1");
    const validated = validateAttentionLifecycleTransition({
      attentionId: "attention-1",
      targetStatus: "resolved",
      reason: "Gate executado.",
      confirmed: true,
    });
    if (!validated.ok) throw new Error("fixture validation failed");
    const planned = planAttentionLifecycleTransition(
      validated.value,
      {
        actorId: "owner-1",
        auditId: "audit-sync",
        correlationId: "correlation-sync",
        now: "2026-08-04T06:00:00.000Z",
      },
      before,
    );
    if (!planned.ok) throw new Error("fixture planning failed");

    expect(
      repository.transitionWithAuditSync(
        planned.audit.before,
        planned.attention,
        planned.audit,
      ),
    ).toBe(true);
    expect(repository.findByIdSync("attention-1")).toMatchObject({
      status: "resolved",
      resolvedAt: "2026-08-04T06:00:00.000Z",
    });
    expect(
      database.$client
        .prepare("SELECT correlation_id FROM audit_events WHERE id = ?")
        .get("audit-sync"),
    ).toEqual({ correlation_id: "correlation-sync" });
    database.$client.close();
  });
});
