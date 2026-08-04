import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { createSqliteDevOSCommandGateway } from "./devos-command-gateway";

describe("blocked roadmap.stages.complete command", () => {
  it("requires a real DevOS approval before receipt or execution", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const gateway = createSqliteDevOSCommandGateway({
      database,
      now: () => "2026-08-04T06:00:00.000Z",
      randomUUID: () => "generated-1",
    });

    await expect(
      gateway.execute({
        commandId: "roadmap.stages.complete",
        commandVersion: 1,
        target: { resourceType: "stage", resourceId: "demo-stage-database" },
        payload: {
          stageId: "demo-stage-database",
          reason: "Critérios conferidos.",
        },
        expected: {
          stageUpdatedAt: "2026-08-01T00:00:00.000Z",
          snapshotHash: "a".repeat(64),
        },
        context: {
          ownerId: "owner-1",
          actor: { kind: "owner_ui", actorId: "owner-1" },
          correlationId: "correlation-stage",
          idempotencyKey: "stage-key",
          reason: "Critérios conferidos.",
          confirmed: true,
          approvalId: "client-supplied-not-verified",
        },
      }),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "COMMAND_APPROVAL_REQUIRED", retryable: false },
      replayed: false,
      receiptId: null,
    });
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM command_receipts")
        .get(),
    ).toEqual({ count: 0 });
    expect(
      database.$client
        .prepare("SELECT state FROM stages WHERE id = ?")
        .get("demo-stage-database"),
    ).not.toEqual({ state: "completed" });
    database.$client.close();
  });
});
