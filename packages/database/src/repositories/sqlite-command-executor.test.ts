import { afterEach, describe, expect, it, vi } from "vitest";
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

function harness() {
  const database = createSqliteDatabase(":memory:");
  databases.push(database);
  migrate(database);
  database.$client.exec(
    `CREATE TABLE command_test_state (
      id TEXT PRIMARY KEY,
      value INTEGER NOT NULL
    );
    INSERT INTO command_test_state (id, value) VALUES ('state-1', 0);`,
  );
  return {
    database,
    executor: new SqliteTransactionalCommandExecutor(
      database,
      new SqliteCommandReceiptRepository(database),
    ),
  };
}

function claim() {
  return {
    id: "receipt-1",
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
    claimedAt: "2026-08-04T05:00:00.000Z",
    leaseExpiresAt: "2026-08-04T05:05:00.000Z",
    correlationId: "correlation-1",
    idempotencyKey: "idempotency-1",
  };
}

function insertAudit(
  database: ReturnType<typeof createSqliteDatabase>,
  id = "audit-1",
): void {
  database.$client
    .prepare(
      `INSERT INTO audit_events (
        id, actor, action, entity_type, entity_id, before_json, after_json,
        reason, occurred_at, source, confirmed, correlation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      "owner-1",
      "attention.transition",
      "attention",
      "attention-1",
      '{"status":"new"}',
      '{"status":"acknowledged"}',
      "Acknowledge",
      "2026-08-04T05:01:00.000Z",
      "manual",
      1,
      "correlation-1",
    );
}

describe("SqliteTransactionalCommandExecutor", () => {
  it("commits state, audit and succeeded receipt together, then replays", async () => {
    const { database, executor } = harness();
    const runner = vi.fn<SqliteCommandRunner>(() => {
      database.$client
        .prepare("UPDATE command_test_state SET value = value + 1 WHERE id = ?")
        .run("state-1");
      insertAudit(database);
      return {
        kind: "success",
        auditEventId: "audit-1",
        summary: { attentionId: "attention-1", status: "acknowledged" },
      };
    });

    await expect(
      executor.execute({ claim: claim(), completedAt: "2026-08-04T05:01:00.000Z" }, runner),
    ).resolves.toMatchObject({
      kind: "succeeded",
      replayed: false,
      summary: { status: "acknowledged" },
    });
    expect(
      database.$client.prepare("SELECT value FROM command_test_state").get(),
    ).toEqual({ value: 1 });
    expect(
      database.$client.prepare("SELECT COUNT(*) AS count FROM audit_events").get(),
    ).toEqual({ count: 1 });
    expect(
      database.$client
        .prepare("SELECT status FROM command_receipts WHERE id = ?")
        .get("receipt-1"),
    ).toEqual({ status: "succeeded" });

    await expect(
      executor.execute(
        {
          claim: { ...claim(), id: "receipt-regenerated" },
          completedAt: "2026-08-04T05:02:00.000Z",
        },
        runner,
      ),
    ).resolves.toMatchObject({
      kind: "succeeded",
      replayed: true,
      receiptId: "receipt-1",
    });
    expect(runner).toHaveBeenCalledOnce();
  });

  it("rolls back state and audit when the runner returns a stable failure", async () => {
    const { database, executor } = harness();
    const runner: SqliteCommandRunner = () => {
      database.$client
        .prepare("UPDATE command_test_state SET value = 10 WHERE id = ?")
        .run("state-1");
      insertAudit(database);
      return {
        kind: "failure",
        stableErrorCode: "ATTENTION_CONFLICT",
        retryable: false,
      };
    };

    await expect(
      executor.execute({ claim: claim(), completedAt: "2026-08-04T05:01:00.000Z" }, runner),
    ).resolves.toEqual({
      kind: "failed",
      replayed: false,
      receiptId: "receipt-1",
      stableErrorCode: "ATTENTION_CONFLICT",
      retryable: false,
    });
    expect(
      database.$client.prepare("SELECT value FROM command_test_state").get(),
    ).toEqual({ value: 0 });
    expect(
      database.$client.prepare("SELECT COUNT(*) AS count FROM audit_events").get(),
    ).toEqual({ count: 0 });
  });

  it("rolls back when the declared audit record is missing", async () => {
    const { database, executor } = harness();
    const runner: SqliteCommandRunner = () => {
      database.$client
        .prepare("UPDATE command_test_state SET value = 10 WHERE id = ?")
        .run("state-1");
      return {
        kind: "success",
        auditEventId: "missing-audit",
        summary: { status: "acknowledged" },
      };
    };

    await expect(
      executor.execute({ claim: claim(), completedAt: "2026-08-04T05:01:00.000Z" }, runner),
    ).resolves.toMatchObject({
      kind: "failed",
      stableErrorCode: "COMMAND_AUDIT_MISSING",
      retryable: false,
    });
    expect(
      database.$client.prepare("SELECT value FROM command_test_state").get(),
    ).toEqual({ value: 0 });
  });

  it("forbids async runners inside the synchronous SQLite transaction", async () => {
    const { executor } = harness();
    const runner = (() => Promise.resolve({
      kind: "success" as const,
      auditEventId: "audit-1",
      summary: { status: "acknowledged" },
    })) as unknown as SqliteCommandRunner;

    await expect(
      executor.execute({ claim: claim(), completedAt: "2026-08-04T05:01:00.000Z" }, runner),
    ).resolves.toMatchObject({
      kind: "failed",
      stableErrorCode: "COMMAND_RUNNER_ASYNC_FORBIDDEN",
      retryable: false,
    });
  });

  it("does not execute on idempotency conflict or an active lease", async () => {
    const { executor } = harness();
    const runner = vi.fn<SqliteCommandRunner>(() => ({
      kind: "failure",
      stableErrorCode: "SHOULD_NOT_RUN",
      retryable: false,
    }));
    await executor.execute(
      { claim: claim(), completedAt: "2026-08-04T05:01:00.000Z" },
      (() => new Promise(() => undefined)) as unknown as SqliteCommandRunner,
    );

    await expect(
      executor.execute(
        {
          claim: { ...claim(), id: "receipt-2", requestHash: "b".repeat(64) },
          completedAt: "2026-08-04T05:01:30.000Z",
        },
        runner,
      ),
    ).resolves.toEqual({ kind: "conflict" });
    expect(runner).not.toHaveBeenCalled();
  });
});
