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

function harness() {
  const database = createSqliteDatabase(":memory:");
  databases.push(database);
  migrate(database);
  return {
    database,
    repository: new SqliteCommandReceiptRepository(database),
  };
}

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
    claimedAt: "2026-08-04T05:00:00.000Z",
    leaseExpiresAt: "2026-08-04T05:05:00.000Z",
    correlationId: "correlation-1",
    idempotencyKey: "idempotency-1",
    ...overrides,
  };
}

describe("SqliteCommandReceiptRepository", () => {
  it("claims a semantic request exactly once", async () => {
    const { database, repository } = harness();

    await expect(repository.claim(claim())).resolves.toMatchObject({
      kind: "claimed",
      recovered: false,
      receipt: {
        id: "receipt-1",
        status: "in_progress",
        requestHash: "a".repeat(64),
      },
    });
    expect(
      database.$client
        .prepare("SELECT COUNT(*) AS count FROM command_receipts")
        .get(),
    ).toEqual({ count: 1 });
    await expect(
      repository.claim(
        claim({
          id: "receipt-regenerated",
          claimedAt: "2026-08-04T05:01:00.000Z",
          leaseExpiresAt: "2026-08-04T05:06:00.000Z",
          correlationId: "correlation-retry",
        }),
      ),
    ).resolves.toMatchObject({
      kind: "in_progress",
      receipt: { id: "receipt-1" },
    });
  });

  it("conflicts when the same semantic key carries a different request hash", async () => {
    const { repository } = harness();
    await repository.claim(claim());

    await expect(
      repository.claim(claim({ id: "receipt-2", requestHash: "b".repeat(64) })),
    ).resolves.toEqual({ kind: "conflict" });
  });

  it("atomically recovers an expired lease without changing receipt identity", async () => {
    const { repository } = harness();
    await repository.claim(claim());

    await expect(
      repository.claim(
        claim({
          id: "receipt-regenerated",
          claimedAt: "2026-08-04T05:05:00.000Z",
          leaseExpiresAt: "2026-08-04T05:10:00.000Z",
          correlationId: "correlation-recovery",
        }),
      ),
    ).resolves.toMatchObject({
      kind: "claimed",
      recovered: true,
      receipt: {
        id: "receipt-1",
        claimedAt: "2026-08-04T05:00:00.000Z",
        leaseExpiresAt: "2026-08-04T05:10:00.000Z",
        correlationId: "correlation-1",
      },
    });
  });

  it("finalizes success once and replays the bounded result", async () => {
    const { repository } = harness();
    await repository.claim(claim());

    const finalized = await repository.finalize({
      kind: "success",
      receiptId: "receipt-1",
      requestHash: "a".repeat(64),
      resultHash: "899a19d40bf2a57456d63ba695f19cb5ecae00bbf0f8baa0216cf889f97715bb",
      resultSummaryJson: '{"status":"acknowledged"}',
      stableErrorCode: null,
      retryable: null,
      completedAt: "2026-08-04T05:01:00.000Z",
    });
    expect(finalized).toMatchObject({
      status: "succeeded",
      resultSummaryJson: '{"status":"acknowledged"}',
    });

    await expect(
      repository.claim(
        claim({
          id: "receipt-2",
          claimedAt: "2026-08-04T05:02:00.000Z",
          leaseExpiresAt: "2026-08-04T05:07:00.000Z",
        }),
      ),
    ).resolves.toMatchObject({
      kind: "replay_succeeded",
      receipt: { id: "receipt-1", status: "succeeded" },
    });
    await expect(repository.finalize({
      kind: "failure",
      receiptId: "receipt-1",
      requestHash: "a".repeat(64),
      resultHash: null,
      resultSummaryJson: null,
      stableErrorCode: "ATTENTION_CONFLICT",
      retryable: false,
      completedAt: "2026-08-04T05:02:00.000Z",
    })).resolves.toBeNull();
  });

  it("finalizes a stable failure and replays it without exception text", async () => {
    const { repository } = harness();
    await repository.claim(claim());
    await expect(repository.finalize({
      kind: "failure",
      receiptId: "receipt-1",
      requestHash: "a".repeat(64),
      resultHash: null,
      resultSummaryJson: null,
      stableErrorCode: "ATTENTION_CONFLICT",
      retryable: false,
      completedAt: "2026-08-04T05:01:00.000Z",
    })).resolves.toMatchObject({
      status: "failed",
      stableErrorCode: "ATTENTION_CONFLICT",
      retryable: false,
    });

    await expect(repository.claim(claim({ id: "receipt-2" }))).resolves.toMatchObject({
      kind: "replay_failed",
      receipt: {
        stableErrorCode: "ATTENTION_CONFLICT",
        resultSummaryJson: null,
      },
    });
  });

  it("rejects a success whose result hash does not match its canonical summary", async () => {
    const { database, repository } = harness();
    await repository.claim(claim());

    await expect(repository.finalize({
      kind: "success",
      receiptId: "receipt-1",
      requestHash: "a".repeat(64),
      resultHash: "b".repeat(64),
      resultSummaryJson: '{"status":"acknowledged"}',
      stableErrorCode: null,
      retryable: null,
      completedAt: "2026-08-04T05:01:00.000Z",
    })).resolves.toBeNull();
    expect(
      database.$client
        .prepare("SELECT status FROM command_receipts WHERE id = ?")
        .get("receipt-1"),
    ).toEqual({ status: "in_progress" });
  });
});
