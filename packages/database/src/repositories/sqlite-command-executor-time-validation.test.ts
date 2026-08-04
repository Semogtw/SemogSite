import { afterEach, describe, expect, it, vi } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteCommandReceiptRepository } from "./command-receipt-repository";
import { SqliteTransactionalCommandExecutor } from "./sqlite-command-executor";

const databases: ReturnType<typeof createSqliteDatabase>[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.$client.close();
});

function claim() {
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
    claimedAt: "2026-08-04T05:00:00.000Z",
    leaseExpiresAt: "2026-08-04T05:05:00.000Z",
    correlationId: "correlation-1",
    idempotencyKey: "idempotency-1",
  };
}

describe("SQLite command executor time validation", () => {
  it.each([
    "2026-02-31T05:01:00.000Z",
    "2026-08-04T05:01:00Z",
    "2026-08-04T02:01:00.000-03:00",
    "2026-08-04T04:59:59.999Z",
  ])("rejects completion time %j before storage and runner", async (completedAt) => {
    const database = createSqliteDatabase(":memory:");
    databases.push(database);
    migrate(database);
    const runner = vi.fn(() => ({
      kind: "failure" as const,
      stableErrorCode: "SHOULD_NOT_RUN",
      retryable: false,
    }));
    const executor = new SqliteTransactionalCommandExecutor(
      database,
      new SqliteCommandReceiptRepository(database),
    );

    await expect(
      executor.execute({ claim: claim(), completedAt }, runner),
    ).rejects.toThrow("COMMAND_EXECUTION_TIME_INVALID");
    expect(runner).not.toHaveBeenCalled();
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM command_receipts")
        .get(),
    ).toEqual({ count: 0 });
  });
});
