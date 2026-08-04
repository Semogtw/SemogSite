import { afterEach, describe, expect, it, vi } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteCommandReceiptRepository } from "./command-receipt-repository";
import {
  SqliteTransactionalCommandExecutor,
  type SqliteCommandExecutionContext,
  type SqliteCommandRunner,
} from "./sqlite-command-executor";

const databases: ReturnType<typeof createSqliteDatabase>[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.$client.close();
});

function originalClaim() {
  return {
    id: "receipt-original",
    ownerId: "owner-1",
    commandId: "attention.transition",
    commandVersion: 1,
    capability: "attention.write",
    resourceType: "attention",
    resourceId: "attention-1",
    actorKind: "owner_ui" as const,
    actorId: "owner-1",
    clientId: "",
    requestHash: "a".repeat(64),
    claimedAt: "2026-08-04T06:00:00.000Z",
    leaseExpiresAt: "2026-08-04T06:05:00.000Z",
    correlationId: "correlation-original",
    idempotencyKey: "same-key",
  };
}

describe("SqliteTransactionalCommandExecutor lease recovery", () => {
  it("runs a recovered command with the receipt identity and original correlation", async () => {
    const database = createSqliteDatabase(":memory:");
    databases.push(database);
    migrate(database);
    database.$client.exec(
      `CREATE TABLE command_recovery_state (
        id TEXT PRIMARY KEY,
        value INTEGER NOT NULL
      );
      INSERT INTO command_recovery_state (id, value) VALUES ('state-1', 0);`,
    );
    const receipts = new SqliteCommandReceiptRepository(database);
    await receipts.claim(originalClaim());
    const executor = new SqliteTransactionalCommandExecutor(database, receipts);
    let observedContext: SqliteCommandExecutionContext | null = null;

    const runner = vi.fn<SqliteCommandRunner>((context) => {
      observedContext = context;
      database.$client
        .prepare("UPDATE command_recovery_state SET value = 1 WHERE id = ?")
        .run("state-1");
      database.$client
        .prepare(
          `INSERT INTO audit_events (
            id, actor, action, entity_type, entity_id, before_json, after_json,
            reason, occurred_at, source, confirmed, correlation_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "audit-recovery",
          "owner-1",
          "attention.transition",
          "attention",
          "attention-1",
          '{"status":"new"}',
          '{"status":"resolved"}',
          "Recover expired execution",
          "2026-08-04T06:06:00.000Z",
          "manual",
          1,
          context.correlationId,
        );
      return {
        kind: "success",
        auditEventId: "audit-recovery",
        summary: { attentionId: "attention-1", status: "resolved" },
      };
    });

    await expect(
      executor.execute(
        {
          claim: {
            ...originalClaim(),
            id: "receipt-regenerated",
            claimedAt: "2026-08-04T06:05:00.000Z",
            leaseExpiresAt: "2026-08-04T06:10:00.000Z",
            correlationId: "correlation-retry",
          },
          completedAt: "2026-08-04T06:06:00.000Z",
        },
        runner,
      ),
    ).resolves.toMatchObject({
      kind: "succeeded",
      replayed: false,
      receiptId: "receipt-original",
    });

    expect(observedContext).toMatchObject({
      receiptId: "receipt-original",
      correlationId: "correlation-original",
      recovered: true,
      resourceType: "attention",
      resourceId: "attention-1",
    });
    expect(
      database.$client.prepare("SELECT value FROM command_recovery_state").get(),
    ).toEqual({ value: 1 });
  });
});
