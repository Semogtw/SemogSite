import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSqliteDatabase, migrate } from "../adapters/sqlite";
import { SqliteCommandReceiptRepository } from "../repositories/command-receipt-repository";
import { createVerifiedSqliteBackup } from "./sqlite-backup";

const temporaryDirectories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "semogtw-command-backup-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("command receipt backup", () => {
  it("restores a finalized receipt without raw command payload", async () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const repository = new SqliteCommandReceiptRepository(database);
    await repository.claim({
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
    });
    await repository.finalize({
      kind: "failure",
      receiptId: "receipt-1",
      requestHash: "a".repeat(64),
      resultHash: null,
      resultSummaryJson: null,
      stableErrorCode: "ATTENTION_CONFLICT",
      retryable: false,
      completedAt: "2026-08-04T05:01:00.000Z",
    });

    const destination = join(temporaryDirectory(), "commands.sqlite");
    const backup = await createVerifiedSqliteBackup(database, destination);
    database.$client.close();

    expect(backup.migrations.at(-1)).toBe("0017_command_core.sql");
    const restored = createSqliteDatabase(destination);
    expect(
      restored.$client
        .prepare(
          `SELECT command_id, resource_type, resource_id, status,
                  stable_error_code, retryable, result_summary_json
           FROM command_receipts WHERE id = ?`,
        )
        .get("receipt-1"),
    ).toEqual({
      command_id: "attention.transition",
      resource_type: "attention",
      resource_id: "attention-1",
      status: "failed",
      stable_error_code: "ATTENTION_CONFLICT",
      retryable: 0,
      result_summary_json: null,
    });
    const columns = restored.$client
      .prepare("PRAGMA table_info(command_receipts)")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(columns.some((name) => /payload|token|cookie|secret/iu.test(name))).toBe(false);
    restored.$client.close();
  });
});
