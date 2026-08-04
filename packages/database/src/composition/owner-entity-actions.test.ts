import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { getOwnerEntityActions } from "./owner-entity-actions";

describe("owner entity action SQLite resolution", () => {
  it("returns resource-filtered Attention and stage metadata", () => {
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
        "attention-actions",
        null,
        "Resolver item",
        "open",
        "medium",
        "decision",
        "owner",
        "Revisar e finalizar.",
        null,
        null,
        "manual",
        "2026-08-04T05:00:00.000Z",
        "2026-08-04T05:00:00.000Z",
      );

    expect(
      getOwnerEntityActions({
        database,
        ownerId: "owner-1",
        resourceType: "attention_item",
        resourceId: "attention-actions",
      }),
    ).toEqual([
      {
        commandId: "attention.transition",
        labelPtBr: "Finalizar item",
        risk: "medium",
        reversible: true,
        availability: "confirmation_required",
      },
    ]);
    expect(
      getOwnerEntityActions({
        database,
        ownerId: "owner-1",
        resourceType: "stage",
        resourceId: "demo-stage-database",
      }),
    ).toEqual([
      {
        commandId: "roadmap.stages.complete",
        labelPtBr: "Concluir etapa",
        risk: "high",
        reversible: true,
        availability: "planned",
      },
    ]);
    database.$client.close();
  });

  it("returns an empty list for absent, unsupported or terminal resources", () => {
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
        "attention-final",
        null,
        "Item finalizado",
        "resolved",
        "low",
        "decision",
        "owner",
        "Nenhuma ação.",
        null,
        "2026-08-04T05:30:00.000Z",
        "manual",
        "2026-08-04T05:00:00.000Z",
        "2026-08-04T05:30:00.000Z",
      );

    for (const resource of [
      { resourceType: "attention_item", resourceId: "missing" },
      { resourceType: "attention_item", resourceId: "attention-final" },
      { resourceType: "unknown", resourceId: "anything" },
    ]) {
      expect(
        getOwnerEntityActions({
          database,
          ownerId: "owner-1",
          ...resource,
        }),
      ).toEqual([]);
    }
    database.$client.close();
  });
});
