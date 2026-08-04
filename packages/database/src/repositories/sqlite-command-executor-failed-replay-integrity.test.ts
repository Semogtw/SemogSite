import { afterEach, describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteCommandReceiptRepository } from "./command-receipt-repository";
import { SqliteTransactionalCommandExecutor } from "./sqlite-command-executor";

const databases: ReturnType<typeof createSqliteDatabase>[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.$client.close();
});

describe("failed command receipt replay integrity", () => {
  it("fails closed when a restored failed receipt lacks a stable error", async () => {
    const database = createSqliteDatabase(":memory:");
    databases.push(database);
    migrate(database);
    database.$client.exec("PRAGMA ignore_check_constraints = ON;");
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
        "receipt-corrupt-failure",
        "owner-1",
        "attention.transition",
        1,
        "attention.write",
        "attention_item",
        "attention-1",
        "owner_ui",
        "owner-1",
        "",
        "a".repeat(64),
        "failed",
        null,
        null,
        null,
        0,
        "2026-08-04T06:00:00.000Z",
        "2026-08-04T06:05:00.000Z",
        "2026-08-04T06:01:00.000Z",
        "correlation-1",
        "idempotency-1",
        "2026-08-04T06:00:00.000Z",
        "2026-08-04T06:01:00.000Z",
      );
    database.$client.exec("PRAGMA ignore_check_constraints = OFF;");

    const executor = new SqliteTransactionalCommandExecutor(
      database,
      new SqliteCommandReceiptRepository(database),
    );
    await expect(
      executor.execute(
        {
          claim: {
            id: "receipt-regenerated",
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
            claimedAt: "2026-08-04T06:02:00.000Z",
            leaseExpiresAt: "2026-08-04T06:07:00.000Z",
            correlationId: "correlation-retry",
            idempotencyKey: "idempotency-1",
          },
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
      receiptId: "receipt-corrupt-failure",
      stableErrorCode: "COMMAND_RECEIPT_RESULT_INVALID",
      retryable: false,
    });
  });
});
