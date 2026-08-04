import type { CommandEnvelope } from "@semogtw/application";
import { afterEach, describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { createSqliteDevOSCommandGateway } from "./devos-command-gateway";

const databases: ReturnType<typeof createSqliteDatabase>[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.$client.close();
});

function harness(now: string) {
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
      "Rodar os testes.",
      null,
      null,
      "manual",
      "2026-08-04T05:00:00.000Z",
      "2026-08-04T05:30:00.000Z",
    );
  return {
    database,
    gateway: createSqliteDevOSCommandGateway({
      database,
      now: () => now,
      randomUUID: () => "generated-1",
    }),
  };
}

function envelope(expectedUpdatedAt: string): CommandEnvelope {
  return {
    commandId: "attention.transition",
    commandVersion: 1,
    target: {
      resourceType: "attention_item",
      resourceId: "attention-1",
    },
    payload: {
      attentionId: "attention-1",
      targetStatus: "resolved",
      reason: "O gate foi executado.",
    },
    expected: { updatedAt: expectedUpdatedAt },
    context: {
      ownerId: "owner-1",
      actor: { kind: "owner_ui", actorId: "owner-1" },
      correlationId: "correlation-1",
      idempotencyKey: "same-key",
      reason: "O gate foi executado.",
      confirmed: true,
      approvalId: null,
    },
  };
}

function expectNoMutation(database: ReturnType<typeof createSqliteDatabase>) {
  expect(
    database.$client
      .prepare("SELECT COUNT(*) AS count FROM command_receipts")
      .get(),
  ).toEqual({ count: 0 });
  expect(
    database.$client
      .prepare("SELECT status FROM attention_items WHERE id = ?")
      .get("attention-1"),
  ).toEqual({ status: "open" });
}

describe("SQLite DevOS command gateway time validation", () => {
  it("rejects impossible expected state before receipt claim", async () => {
    const { database, gateway } = harness("2026-08-04T06:00:00.000Z");

    await expect(
      gateway.execute(envelope("2026-02-31T05:30:00.000Z")),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "COMMAND_EXPECTED_STATE_INVALID", retryable: false },
      receiptId: null,
    });
    expectNoMutation(database);
  });

  it("rejects an impossible server clock before receipt claim", async () => {
    const { database, gateway } = harness("2026-02-31T06:00:00.000Z");

    await expect(
      gateway.execute(envelope("2026-08-04T05:30:00.000Z")),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "COMMAND_CLOCK_INVALID", retryable: true },
      receiptId: null,
    });
    expectNoMutation(database);
  });
});
