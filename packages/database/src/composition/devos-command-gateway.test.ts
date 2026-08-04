import { afterEach, describe, expect, it } from "vitest";
import type { CommandEnvelope } from "@semogtw/application";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { createSqliteDevOSCommandGateway } from "./devos-command-gateway";

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
      "Rodar os testes.",
      null,
      null,
      "manual",
      "2026-08-04T05:00:00.000Z",
      "2026-08-04T05:30:00.000Z",
    );
  let sequence = 0;
  return {
    database,
    gateway: createSqliteDevOSCommandGateway({
      database,
      now: () => "2026-08-04T06:00:00.000Z",
      randomUUID: () => `generated-${++sequence}`,
    }),
  };
}

function envelope(
  overrides: Partial<CommandEnvelope> = {},
): CommandEnvelope {
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
    expected: { updatedAt: "2026-08-04T05:30:00.000Z" },
    context: {
      ownerId: "owner-1",
      actor: { kind: "owner_ui", actorId: "owner-1" },
      correlationId: "correlation-1",
      idempotencyKey: "same-key",
      reason: "O gate foi executado.",
      confirmed: true,
      approvalId: null,
    },
    ...overrides,
  };
}

describe("SQLite DevOS command gateway", () => {
  it("requires medium-risk owner confirmation before opening a receipt", async () => {
    const { database, gateway } = harness();

    await expect(
      gateway.execute(
        envelope({
          context: {
            ...envelope().context,
            confirmed: false,
          },
        }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "COMMAND_CONFIRMATION_REQUIRED", retryable: false },
      replayed: false,
      receiptId: null,
    });
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
  });

  it("executes the registered command and replays the original result", async () => {
    const { database, gateway } = harness();

    await expect(gateway.execute(envelope())).resolves.toMatchObject({
      ok: true,
      replayed: false,
      value: {
        attentionId: "attention-1",
        status: "resolved",
        updatedAt: "2026-08-04T06:00:00.000Z",
      },
    });
    await expect(
      gateway.execute(
        envelope({
          context: {
            ...envelope().context,
            correlationId: "correlation-retry",
          },
        }),
      ),
    ).resolves.toMatchObject({
      ok: true,
      replayed: true,
      value: { attentionId: "attention-1", status: "resolved" },
    });
    expect(
      database.$client.prepare("SELECT COUNT(*) AS count FROM audit_events").get(),
    ).toEqual({ count: 1 });
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM command_receipts")
        .get(),
    ).toEqual({ count: 1 });
  });

  it("rejects missing expected state before claim and changed payload after claim", async () => {
    const first = harness();
    await expect(
      first.gateway.execute(envelope({ expected: {} })),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "COMMAND_EXPECTED_STATE_INVALID" },
      receiptId: null,
    });
    expect(
      first.database.$client
        .prepare("SELECT COUNT(*) AS count FROM command_receipts")
        .get(),
    ).toEqual({ count: 0 });

    const second = harness();
    await second.gateway.execute(envelope());
    await expect(
      second.gateway.execute(
        envelope({
          payload: {
            attentionId: "attention-1",
            targetStatus: "dismissed",
            reason: "Descartar o item.",
          },
          context: {
            ...envelope().context,
            reason: "Descartar o item.",
          },
        }),
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "IDEMPOTENCY_PAYLOAD_CONFLICT", retryable: false },
      replayed: false,
      receiptId: null,
    });
    expect(
      second.database.$client.prepare("SELECT COUNT(*) AS count FROM audit_events").get(),
    ).toEqual({ count: 1 });
  });
});
