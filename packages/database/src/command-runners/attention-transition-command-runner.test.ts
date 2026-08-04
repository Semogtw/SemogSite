import { afterEach, describe, expect, it } from "vitest";
import type { TransitionAttentionPayload } from "@semogtw/application";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteCommandReceiptRepository } from "../repositories/command-receipt-repository";
import { SqliteTransactionalCommandExecutor } from "../repositories/sqlite-command-executor";
import { createAttentionTransitionCommandRunner } from "./attention-transition-command-runner";

const databases: ReturnType<typeof createSqliteDatabase>[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.$client.close();
});

function harness() {
  const database = createSqliteDatabase(":memory:");
  databases.push(database);
  migrate(database);
  database.$client
    .prepare(
      `INSERT INTO attention_items (
        id, project_id, title, status, impact, type, owner, next_action,
        source_url, resolved_at, data_source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "attention-1",
      null,
      "Executar gates",
      "open",
      "high",
      "risk",
      "owner",
      "Rodar os testes no ambiente correto.",
      null,
      null,
      "manual",
      "2026-08-04T05:00:00.000Z",
      "2026-08-04T05:30:00.000Z",
    );
  return {
    database,
    executor: new SqliteTransactionalCommandExecutor(
      database,
      new SqliteCommandReceiptRepository(database),
    ),
  };
}

function claim(resourceId = "attention-1") {
  return {
    id: "receipt-attention-1",
    ownerId: "owner-1",
    commandId: "attention.transition",
    commandVersion: 1,
    capability: "attention.write",
    resourceType: "attention_item",
    resourceId,
    actorKind: "owner_ui" as const,
    actorId: "owner-1",
    clientId: "",
    requestHash: "a".repeat(64),
    claimedAt: "2026-08-04T06:00:00.000Z",
    leaseExpiresAt: "2026-08-04T06:05:00.000Z",
    correlationId: "correlation-attention-1",
    idempotencyKey: "attention-key-1",
  };
}

const payload: TransitionAttentionPayload = {
  attentionId: "attention-1",
  targetStatus: "resolved",
  reason: "O gate foi executado e a evidência foi registrada.",
};

describe("attention.transition SQLite command runner", () => {
  it("commits the domain-planned state, audit and receipt atomically", async () => {
    const { database, executor } = harness();
    const runner = createAttentionTransitionCommandRunner({
      database,
      payload,
      expectedUpdatedAt: "2026-08-04T05:30:00.000Z",
      now: "2026-08-04T06:01:00.000Z",
    });

    await expect(
      executor.execute(
        {
          claim: claim(),
          completedAt: "2026-08-04T06:01:00.000Z",
        },
        runner,
      ),
    ).resolves.toMatchObject({
      kind: "succeeded",
      replayed: false,
      receiptId: "receipt-attention-1",
      summary: {
        attentionId: "attention-1",
        status: "resolved",
        updatedAt: "2026-08-04T06:01:00.000Z",
      },
    });
    expect(
      database.$client
        .prepare(
          "SELECT status, resolved_at, updated_at FROM attention_items WHERE id = ?",
        )
        .get("attention-1"),
    ).toEqual({
      status: "resolved",
      resolved_at: "2026-08-04T06:01:00.000Z",
      updated_at: "2026-08-04T06:01:00.000Z",
    });
    expect(
      database.$client
        .prepare(
          `SELECT actor, action, entity_type, entity_id, correlation_id
           FROM audit_events`,
        )
        .get(),
    ).toEqual({
      actor: "owner-1",
      action: "attention.resolve",
      entity_type: "attention_item",
      entity_id: "attention-1",
      correlation_id: "correlation-attention-1",
    });
  });

  it("maps a stale expected timestamp to COMMAND_TARGET_CHANGED without mutation", async () => {
    const { database, executor } = harness();

    await expect(
      executor.execute(
        {
          claim: claim(),
          completedAt: "2026-08-04T06:01:00.000Z",
        },
        createAttentionTransitionCommandRunner({
          database,
          payload,
          expectedUpdatedAt: "2026-08-04T05:00:00.000Z",
          now: "2026-08-04T06:01:00.000Z",
        }),
      ),
    ).resolves.toMatchObject({
      kind: "failed",
      stableErrorCode: "COMMAND_TARGET_CHANGED",
      retryable: false,
    });
    expect(
      database.$client
        .prepare("SELECT status FROM attention_items WHERE id = ?")
        .get("attention-1"),
    ).toEqual({ status: "open" });
    expect(
      database.$client.prepare("SELECT COUNT(*) AS count FROM audit_events").get(),
    ).toEqual({ count: 0 });
  });

  it("maps missing and already-final targets to stable command errors", async () => {
    const missing = harness();
    await expect(
      missing.executor.execute(
        {
          claim: claim("missing-attention"),
          completedAt: "2026-08-04T06:01:00.000Z",
        },
        createAttentionTransitionCommandRunner({
          database: missing.database,
          payload: { ...payload, attentionId: "missing-attention" },
          expectedUpdatedAt: "2026-08-04T05:30:00.000Z",
          now: "2026-08-04T06:01:00.000Z",
        }),
      ),
    ).resolves.toMatchObject({
      kind: "failed",
      stableErrorCode: "COMMAND_TARGET_NOT_FOUND",
      retryable: false,
    });

    const final = harness();
    final.database.$client
      .prepare(
        `UPDATE attention_items
         SET status = 'dismissed', resolved_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        "2026-08-04T05:45:00.000Z",
        "2026-08-04T05:45:00.000Z",
        "attention-1",
      );
    await expect(
      final.executor.execute(
        {
          claim: { ...claim(), id: "receipt-attention-final", idempotencyKey: "final-key" },
          completedAt: "2026-08-04T06:01:00.000Z",
        },
        createAttentionTransitionCommandRunner({
          database: final.database,
          payload,
          expectedUpdatedAt: "2026-08-04T05:45:00.000Z",
          now: "2026-08-04T06:01:00.000Z",
        }),
      ),
    ).resolves.toMatchObject({
      kind: "failed",
      stableErrorCode: "COMMAND_TARGET_CHANGED",
      retryable: false,
    });
  });
});
