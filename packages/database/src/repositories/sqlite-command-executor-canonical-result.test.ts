import { createHash } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteCommandReceiptRepository } from "./command-receipt-repository";
import {
  SqliteTransactionalCommandExecutor,
  type SqliteCommandRunner,
} from "./sqlite-command-executor";

const databases: ReturnType<typeof createSqliteDatabase>[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.$client.close();
});

function claim() {
  return {
    id: "receipt-canonical",
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
    correlationId: "correlation-canonical",
    idempotencyKey: "canonical-key",
  };
}

describe("SQLite command result canonicalization", () => {
  it("stores and hashes a recursively canonical result summary", async () => {
    const database = createSqliteDatabase(":memory:");
    databases.push(database);
    migrate(database);
    const executor = new SqliteTransactionalCommandExecutor(
      database,
      new SqliteCommandReceiptRepository(database),
    );
    const runner: SqliteCommandRunner = () => {
      database.$client
        .prepare(
          `INSERT INTO audit_events (
            id, actor, action, entity_type, entity_id, before_json, after_json,
            reason, occurred_at, source, confirmed, correlation_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "audit-canonical",
          "owner-1",
          "attention.resolve",
          "attention_item",
          "attention-1",
          '{"status":"open"}',
          '{"status":"resolved"}',
          "Canonical result",
          "2026-08-04T06:01:00.000Z",
          "manual",
          1,
          "correlation-canonical",
        );
      return {
        kind: "success",
        auditEventId: "audit-canonical",
        summary: {
          status: "resolved",
          nested: { z: 2, a: 1 },
          attentionId: "attention-1",
        },
      };
    };

    await executor.execute(
      { claim: claim(), completedAt: "2026-08-04T06:01:00.000Z" },
      runner,
    );

    const expectedJson =
      '{"attentionId":"attention-1","nested":{"a":1,"z":2},"status":"resolved"}';
    expect(
      database.$client
        .prepare(
          `SELECT result_summary_json, result_hash
           FROM command_receipts WHERE id = ?`,
        )
        .get("receipt-canonical"),
    ).toEqual({
      result_summary_json: expectedJson,
      result_hash: createHash("sha256").update(expectedJson, "utf8").digest("hex"),
    });

    await expect(
      executor.execute(
        {
          claim: { ...claim(), id: "receipt-regenerated" },
          completedAt: "2026-08-04T06:02:00.000Z",
        },
        () => ({
          kind: "failure",
          stableErrorCode: "SHOULD_NOT_RUN",
          retryable: false,
        }),
      ),
    ).resolves.toMatchObject({
      kind: "succeeded",
      replayed: true,
      summary: {
        attentionId: "attention-1",
        nested: { a: 1, z: 2 },
        status: "resolved",
      },
    });
  });
});
