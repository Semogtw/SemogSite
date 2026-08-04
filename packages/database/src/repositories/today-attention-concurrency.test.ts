import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteTodayDataSource } from "./today-data-source";

describe("Today attention concurrency projection", () => {
  it("includes the canonical updatedAt used by owner command conflicts", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    database.$client
      .prepare(
        `INSERT INTO attention_items (
          id, project_id, title, status, impact, type, owner, next_action,
          source_url, resolved_at, data_source, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        "attention-concurrency",
        null,
        "Validar alteração concorrente",
        "open",
        "medium",
        "decision",
        "owner",
        "Confirmar o estado antes de finalizar.",
        null,
        null,
        "manual",
        "2026-08-04T05:00:00.000Z",
        "2026-08-04T05:45:00.000Z",
      );

    await expect(
      new SqliteTodayDataSource(database).listOwnerAttention(),
    ).resolves.toContainEqual({
      id: "attention-concurrency",
      projectId: null,
      projectName: null,
      title: "Validar alteração concorrente",
      impact: "medium",
      nextAction: "Confirmar o estado antes de finalizar.",
      updatedAt: "2026-08-04T05:45:00.000Z",
    });
    database.$client.close();
  });
});
