import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteCommandReceiptRepository } from "./command-receipt-repository";

const databases: ReturnType<typeof createSqliteDatabase>[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.$client.close();
});

describe("command receipt canonical finalization", () => {
  it("rejects valid JSON whose key order is not canonical", async () => {
    const database = createSqliteDatabase(":memory:");
    databases.push(database);
    migrate(database);
    const repository = new SqliteCommandReceiptRepository(database);

    await repository.claim({
      id: "receipt-1",
      ownerId: "owner-1",
      commandId: "attention.transition",
      commandVersion: 1,
      capability: "attention.write",
      resourceType: "attention_item",
      resourceId: "attention-1",
      actorKind: "owner_ui",
      actorId: "owner-1",
      clientId: "",
      requestHash: "a".repeat(64),
      claimedAt: "2026-08-04T06:00:00.000Z",
      leaseExpiresAt: "2026-08-04T06:05:00.000Z",
      correlationId: "correlation-1",
      idempotencyKey: "idempotency-1",
    });

    const noncanonical =
      '{"status":"resolved","attentionId":"attention-1"}';
    await expect(
      repository.finalize({
        kind: "success",
        receiptId: "receipt-1",
        requestHash: "a".repeat(64),
        resultHash: createHash("sha256")
          .update(noncanonical, "utf8")
          .digest("hex"),
        resultSummaryJson: noncanonical,
        stableErrorCode: null,
        retryable: null,
        completedAt: "2026-08-04T06:01:00.000Z",
      }),
    ).resolves.toBeNull();

    expect(
      database.$client
        .prepare("SELECT status FROM command_receipts WHERE id = ?")
        .get("receipt-1"),
    ).toEqual({ status: "in_progress" });
  });
});
