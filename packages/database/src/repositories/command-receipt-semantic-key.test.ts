import { afterEach, describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import {
  SqliteCommandReceiptRepository,
  type CommandReceiptClaimInput,
} from "./command-receipt-repository";

const databases: ReturnType<typeof createSqliteDatabase>[] = [];

afterEach(() => {
  for (const database of databases.splice(0)) database.$client.close();
});

function claim(
  overrides: Partial<CommandReceiptClaimInput> = {},
): CommandReceiptClaimInput {
  return {
    id: "receipt-1",
    ownerId: "owner-1",
    commandId: "attention.transition",
    commandVersion: 1,
    capability: "attention.write",
    resourceType: "attention",
    resourceId: "attention-1",
    actorKind: "owner_ui",
    actorId: "owner-1",
    clientId: "",
    requestHash: "a".repeat(64),
    claimedAt: "2026-08-04T06:00:00.000Z",
    leaseExpiresAt: "2026-08-04T06:05:00.000Z",
    correlationId: "correlation-1",
    idempotencyKey: "same-key",
    ...overrides,
  };
}

describe("command receipt semantic key", () => {
  it("conflicts when the same principal, command and key target another resource", async () => {
    const database = createSqliteDatabase(":memory:");
    databases.push(database);
    migrate(database);
    const repository = new SqliteCommandReceiptRepository(database);

    await expect(repository.claim(claim())).resolves.toMatchObject({
      kind: "claimed",
      receipt: { resourceId: "attention-1" },
    });

    await expect(
      repository.claim(
        claim({
          id: "receipt-2",
          resourceId: "attention-2",
          requestHash: "b".repeat(64),
          correlationId: "correlation-2",
        }),
      ),
    ).resolves.toEqual({ kind: "conflict" });

    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM command_receipts")
        .get(),
    ).toEqual({ count: 1 });
  });
});
