import { afterEach, describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteCommandReceiptRepository } from "./command-receipt-repository";

const databases: ReturnType<typeof createSqliteDatabase>[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.$client.close();
});

function validClaim() {
  return {
    id: "receipt-1",
    ownerId: "owner-1",
    commandId: "attention.transition",
    commandVersion: 1,
    capability: "attention.write",
    resourceType: "attention_item",
    resourceId: "attention-1",
    actorKind: "owner_ui" as const,
    actorId: "owner-1",
    clientId: "",
    requestHash: "a".repeat(64),
    claimedAt: "2026-08-04T06:00:00.000Z",
    leaseExpiresAt: "2026-08-04T06:05:00.000Z",
    correlationId: "correlation-1",
    idempotencyKey: "idempotency-1",
  };
}

describe("command receipt claim validation", () => {
  it.each([
    ["blank owner", { ownerId: " " }],
    ["invalid command", { commandId: "Attention Transition" }],
    ["invalid version", { commandVersion: 0 }],
    ["invalid capability", { capability: "write" }],
    ["invalid resource type", { resourceType: "Attention Item" }],
    ["blank resource", { resourceId: "" }],
    ["invalid hash", { requestHash: "not-a-hash" }],
    ["invalid claimed timestamp", { claimedAt: "today" }],
    [
      "non-increasing lease",
      { leaseExpiresAt: "2026-08-04T06:00:00.000Z" },
    ],
    ["blank correlation", { correlationId: "" }],
    ["blank idempotency", { idempotencyKey: "" }],
    [
      "owner client identity",
      { actorKind: "owner_ui" as const, clientId: "client-1" },
    ],
    [
      "missing MCP client identity",
      { actorKind: "mcp_client" as const, clientId: "" },
    ],
  ])("rejects %s before inserting", async (_name, override) => {
    const database = createSqliteDatabase(":memory:");
    databases.push(database);
    migrate(database);
    const repository = new SqliteCommandReceiptRepository(database);

    await expect(
      repository.claim({ ...validClaim(), ...override }),
    ).rejects.toThrow("COMMAND_RECEIPT_CLAIM_INVALID");
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM command_receipts")
        .get(),
    ).toEqual({ count: 0 });
  });
});
