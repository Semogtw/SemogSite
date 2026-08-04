import { describe, expect, it } from "vitest";
import { createSqliteDatabase, migrate } from "./adapters/sqlite";

function insertReceipt(database: ReturnType<typeof createSqliteDatabase>) {
  database.$client
    .prepare(
      `INSERT INTO command_receipts (
        id, owner_id, command_id, command_version, capability,
        resource_type, resource_id, actor_kind, actor_id, client_id,
        request_hash, status, result_hash, result_summary_json,
        stable_error_code, retryable, claimed_at, lease_expires_at,
        completed_at, correlation_id, idempotency_key, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      "receipt-1",
      "owner-1",
      "attention.transition",
      1,
      "attention.write",
      "attention",
      "attention-1",
      "owner_ui",
      "owner-1",
      "",
      "a".repeat(64),
      "in_progress",
      null,
      null,
      null,
      null,
      "2026-08-04T05:00:00.000Z",
      "2026-08-04T05:05:00.000Z",
      null,
      "correlation-1",
      "idempotency-1",
      "2026-08-04T05:00:00.000Z",
      "2026-08-04T05:00:00.000Z",
    );
}

describe("command receipt migration", () => {
  it("applies reserved migration 0017 without claiming 0014 or 0016", () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const names = database.$client
      .prepare("SELECT name FROM _semogtw_migrations ORDER BY name")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(names).toContain("0017_command_core.sql");
    expect(names).not.toContain("0014_mcp_oauth.sql");
    expect(names).not.toContain("0016_growth_evidence_credentials.sql");
    expect(names.at(-1)).toBe("0017_command_core.sql");
    database.$client.close();
  });

  it("stores only bounded receipt metadata and no raw request material", () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    const columns = database.$client
      .prepare("PRAGMA table_info(command_receipts)")
      .all()
      .map((row) => (row as { name: string }).name);

    expect(columns).toEqual([
      "id",
      "owner_id",
      "command_id",
      "command_version",
      "capability",
      "resource_type",
      "resource_id",
      "actor_kind",
      "actor_id",
      "client_id",
      "request_hash",
      "status",
      "result_hash",
      "result_summary_json",
      "stable_error_code",
      "retryable",
      "claimed_at",
      "lease_expires_at",
      "completed_at",
      "correlation_id",
      "idempotency_key",
      "created_at",
      "updated_at",
    ]);
    expect(columns.some((name) => /payload|token|cookie|secret|password/iu.test(name))).toBe(false);
    database.$client.close();
  });

  it("enforces unique semantic keys, hashes and final-state shapes", () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertReceipt(database);

    expect(() => insertReceipt(database)).toThrow();
    expect(() =>
      database.$client
        .prepare(
          `INSERT INTO command_receipts (
            id, owner_id, command_id, command_version, capability,
            resource_type, resource_id, actor_kind, actor_id, client_id,
            request_hash, status, claimed_at, lease_expires_at,
            correlation_id, idempotency_key, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          "receipt-invalid-hash",
          "owner-1",
          "attention.transition",
          1,
          "attention.write",
          "attention",
          "attention-2",
          "owner_ui",
          "owner-1",
          "",
          "not-a-hash",
          "in_progress",
          "2026-08-04T05:00:00.000Z",
          "2026-08-04T05:05:00.000Z",
          "correlation-2",
          "idempotency-2",
          "2026-08-04T05:00:00.000Z",
          "2026-08-04T05:00:00.000Z",
        ),
    ).toThrow();

    database.$client
      .prepare(
        `UPDATE command_receipts
         SET status = 'succeeded', result_hash = ?, result_summary_json = ?,
             completed_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        "b".repeat(64),
        '{"status":"acknowledged"}',
        "2026-08-04T05:01:00.000Z",
        "2026-08-04T05:01:00.000Z",
        "receipt-1",
      );
    expect(
      database.$client
        .prepare(
          "SELECT status, stable_error_code, retryable FROM command_receipts WHERE id = ?",
        )
        .get("receipt-1"),
    ).toEqual({ status: "succeeded", stable_error_code: null, retryable: null });
    database.$client.close();
  });

  it("keeps identity and final receipts immutable", () => {
    const database = createSqliteDatabase(":memory:");
    migrate(database);
    insertReceipt(database);

    expect(() =>
      database.$client
        .prepare("UPDATE command_receipts SET request_hash = ? WHERE id = ?")
        .run("b".repeat(64), "receipt-1"),
    ).toThrow("COMMAND_RECEIPT_IDENTITY_IMMUTABLE");

    database.$client
      .prepare(
        `UPDATE command_receipts
         SET status = 'failed', stable_error_code = 'ATTENTION_CONFLICT',
             retryable = 0, completed_at = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        "2026-08-04T05:01:00.000Z",
        "2026-08-04T05:01:00.000Z",
        "receipt-1",
      );
    expect(() =>
      database.$client
        .prepare("UPDATE command_receipts SET updated_at = ? WHERE id = ?")
        .run("2026-08-04T05:02:00.000Z", "receipt-1"),
    ).toThrow("COMMAND_RECEIPT_FINAL_IMMUTABLE");
    expect(() =>
      database.$client
        .prepare("DELETE FROM command_receipts WHERE id = ?")
        .run("receipt-1"),
    ).toThrow("COMMAND_RECEIPTS_IMMUTABLE");
    database.$client.close();
  });
});
