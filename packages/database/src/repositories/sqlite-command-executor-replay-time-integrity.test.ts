import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteCommandReceiptRepository } from "./command-receipt-repository";
import { SqliteTransactionalCommandExecutor } from "./sqlite-command-executor";

const databases: ReturnType<typeof createSqliteDatabase>[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.$client.close();
});

describe("command replay timestamp integrity", () => {
  it("fails closed when a restored final receipt has impossible UTC dates", async () => {
    const database = createSqliteDatabase(":memory:");
    databases.push(database);
    migrate(database);
    const summary = '{"attentionId":"attention-1","status":"resolved"}';
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
        "receipt-impossible-time",
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
        "succeeded",
        createHash("sha256").update(summary, "utf8").digest("hex"),
        summary,
        null,
        null,
        "2026-02-31T06:00:00.000Z",
        "2026-03-03T06:05:00.000Z",
        "2026-03-01T06:01:00.000Z",
        "correlation-1",
        "idempotency-1",
        "2026-02-31T06:00:00.000Z",
        "2026-03-01T06:01:00.000Z",
      );

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
      receiptId: "receipt-impossible-time",
      stableErrorCode: "COMMAND_RECEIPT_RESULT_INVALID",
      retryable: false,
    });
  });
});
