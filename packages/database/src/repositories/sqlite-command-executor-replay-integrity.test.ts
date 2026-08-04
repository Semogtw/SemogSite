import { afterEach, describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteCommandReceiptRepository } from "./command-receipt-repository";
import { SqliteTransactionalCommandExecutor } from "./sqlite-command-executor";

const databases: ReturnType<typeof createSqliteDatabase>[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.$client.close();
});

function baseReceipt() {
  return {
    id: "receipt-corrupt",
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
    correlationId: "correlation-corrupt",
    idempotencyKey: "corrupt-key",
  };
}

describe("SQLite command replay integrity", () => {
  it("fails closed when a succeeded receipt summary does not match its hash", async () => {
    const database = createSqliteDatabase(":memory:");
    databases.push(database);
    migrate(database);
    const receipt = baseReceipt();
    database.$client
      .prepare(
        `INSERT INTO command_receipts (
          id, owner_id, command_id, command_version, capability,
          resource_type, resource_id, actor_kind, actor_id, client_id,
          request_hash, status, result_hash, result_summary_json,
          stable_error_code, retryable, claimed_at, lease_expires_at,
          completed_at, correlation_id, idempotency_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        receipt.id,
        receipt.ownerId,
        receipt.commandId,
        receipt.commandVersion,
        receipt.capability,
        receipt.resourceType,
        receipt.resourceId,
        receipt.actorKind,
        receipt.actorId,
        receipt.clientId,
        receipt.requestHash,
        "succeeded",
        "b".repeat(64),
        '{"attentionId":"attention-1","status":"resolved"}',
        null,
        null,
        receipt.claimedAt,
        receipt.leaseExpiresAt,
        "2026-08-04T06:01:00.000Z",
        receipt.correlationId,
        receipt.idempotencyKey,
        receipt.claimedAt,
        "2026-08-04T06:01:00.000Z",
      );
    const executor = new SqliteTransactionalCommandExecutor(
      database,
      new SqliteCommandReceiptRepository(database),
    );

    await expect(
      executor.execute(
        {
          claim: { ...receipt, id: "receipt-regenerated" },
          completedAt: "2026-08-04T06:02:00.000Z",
        },
        () => ({
          kind: "failure",
          stableErrorCode: "SHOULD_NOT_RUN",
          retryable: false,
        }),
      ),
    ).resolves.toEqual({
      kind: "failed",
      replayed: true,
      receiptId: "receipt-corrupt",
      stableErrorCode: "COMMAND_RECEIPT_RESULT_INVALID",
      retryable: false,
    });
  });

  it("fails closed when the stored JSON is valid but not canonical", async () => {
    const database = createSqliteDatabase(":memory:");
    databases.push(database);
    migrate(database);
    const receipt = { ...baseReceipt(), id: "receipt-noncanonical", idempotencyKey: "noncanonical-key" };
    const noncanonical = '{"status":"resolved","attentionId":"attention-1"}';
    const { createHash } = await import("node:crypto");
    database.$client
      .prepare(
        `INSERT INTO command_receipts (
          id, owner_id, command_id, command_version, capability,
          resource_type, resource_id, actor_kind, actor_id, client_id,
          request_hash, status, result_hash, result_summary_json,
          stable_error_code, retryable, claimed_at, lease_expires_at,
          completed_at, correlation_id, idempotency_key, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        receipt.id,
        receipt.ownerId,
        receipt.commandId,
        receipt.commandVersion,
        receipt.capability,
        receipt.resourceType,
        receipt.resourceId,
        receipt.actorKind,
        receipt.actorId,
        receipt.clientId,
        receipt.requestHash,
        "succeeded",
        createHash("sha256").update(noncanonical, "utf8").digest("hex"),
        noncanonical,
        null,
        null,
        receipt.claimedAt,
        receipt.leaseExpiresAt,
        "2026-08-04T06:01:00.000Z",
        receipt.correlationId,
        receipt.idempotencyKey,
        receipt.claimedAt,
        "2026-08-04T06:01:00.000Z",
      );
    const executor = new SqliteTransactionalCommandExecutor(
      database,
      new SqliteCommandReceiptRepository(database),
    );

    await expect(
      executor.execute(
        {
          claim: { ...receipt, id: "receipt-regenerated" },
          completedAt: "2026-08-04T06:02:00.000Z",
        },
        () => ({
          kind: "failure",
          stableErrorCode: "SHOULD_NOT_RUN",
          retryable: false,
        }),
      ),
    ).resolves.toMatchObject({
      kind: "failed",
      replayed: true,
      stableErrorCode: "COMMAND_RECEIPT_RESULT_INVALID",
    });
  });
});
