import { canonicalJson } from "@semogtw/application";
import { createHash } from "node:crypto";
import type { SqliteDatabase } from "../adapters/sqlite";

export type CommandReceiptClaimInput = {
  id: string;
  ownerId: string;
  commandId: string;
  commandVersion: number;
  capability: string;
  resourceType: string;
  resourceId: string;
  actorKind: "owner_ui" | "mcp_client" | "system" | "external_adapter";
  actorId: string;
  clientId: string;
  requestHash: string;
  claimedAt: string;
  leaseExpiresAt: string;
  correlationId: string;
  idempotencyKey: string;
};

export type CommandReceiptRecord = CommandReceiptClaimInput & {
  status: "in_progress" | "succeeded" | "failed";
  resultHash: string | null;
  resultSummaryJson: string | null;
  stableErrorCode: string | null;
  retryable: boolean | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CommandReceiptFinalization =
  | {
      kind: "success";
      receiptId: string;
      requestHash: string;
      resultHash: string;
      resultSummaryJson: string;
      stableErrorCode: null;
      retryable: null;
      completedAt: string;
    }
  | {
      kind: "failure";
      receiptId: string;
      requestHash: string;
      resultHash: null;
      resultSummaryJson: null;
      stableErrorCode: string;
      retryable: boolean;
      completedAt: string;
    };

export type CommandReceiptClaimOutcome =
  | { kind: "claimed"; recovered: boolean; receipt: CommandReceiptRecord }
  | { kind: "in_progress"; receipt: CommandReceiptRecord }
  | { kind: "replay_succeeded"; receipt: CommandReceiptRecord }
  | { kind: "replay_failed"; receipt: CommandReceiptRecord }
  | { kind: "conflict" };

type ReceiptRow = {
  id: string;
  owner_id: string;
  command_id: string;
  command_version: number;
  capability: string;
  resource_type: string;
  resource_id: string;
  actor_kind: CommandReceiptRecord["actorKind"];
  actor_id: string;
  client_id: string;
  request_hash: string;
  status: CommandReceiptRecord["status"];
  result_hash: string | null;
  result_summary_json: string | null;
  stable_error_code: string | null;
  retryable: number | null;
  claimed_at: string;
  lease_expires_at: string;
  completed_at: string | null;
  correlation_id: string;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
};

const hashPattern = /^[a-f0-9]{64}$/u;
const stableErrorPattern = /^[A-Z][A-Z0-9_]{0,119}$/u;
const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function fromRow(row: ReceiptRow): CommandReceiptRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    commandId: row.command_id,
    commandVersion: row.command_version,
    capability: row.capability,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    actorKind: row.actor_kind,
    actorId: row.actor_id,
    clientId: row.client_id,
    requestHash: row.request_hash,
    status: row.status,
    resultHash: row.result_hash,
    resultSummaryJson: row.result_summary_json,
    stableErrorCode: row.stable_error_code,
    retryable: row.retryable === null ? null : row.retryable === 1,
    claimedAt: row.claimed_at,
    leaseExpiresAt: row.lease_expires_at,
    completedAt: row.completed_at,
    correlationId: row.correlation_id,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hash(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function timestampValid(value: string): boolean {
  return isoTimestampPattern.test(value) && Number.isFinite(Date.parse(value));
}

function validSummary(value: string): boolean {
  if (Buffer.byteLength(value, "utf8") > 4000) return false;
  try {
    const parsed = JSON.parse(value) as unknown;
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      canonicalJson(parsed) === value
    );
  } catch {
    return false;
  }
}

function finalizationValid(input: CommandReceiptFinalization): boolean {
  if (
    !hashPattern.test(input.requestHash) ||
    !timestampValid(input.completedAt)
  ) {
    return false;
  }
  if (input.kind === "success") {
    return (
      hashPattern.test(input.resultHash) &&
      validSummary(input.resultSummaryJson) &&
      hash(input.resultSummaryJson) === input.resultHash
    );
  }
  return stableErrorPattern.test(input.stableErrorCode);
}

export class SqliteCommandReceiptRepository {
  constructor(private readonly database: SqliteDatabase) {}

  async claim(
    input: CommandReceiptClaimInput,
  ): Promise<CommandReceiptClaimOutcome> {
    const transaction = this.database.$client.transaction(() => {
      const existing = this.findBySemanticKey(input);
      if (existing === null) {
        this.database.$client
          .prepare(
            `INSERT INTO command_receipts (
              id, owner_id, command_id, command_version, capability,
              resource_type, resource_id, actor_kind, actor_id, client_id,
              request_hash, status, result_hash, result_summary_json,
              stable_error_code, retryable, claimed_at, lease_expires_at,
              completed_at, correlation_id, idempotency_key, created_at,
              updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_progress',
              NULL, NULL, NULL, NULL, ?, ?, NULL, ?, ?, ?, ?)`,
          )
          .run(
            input.id,
            input.ownerId,
            input.commandId,
            input.commandVersion,
            input.capability,
            input.resourceType,
            input.resourceId,
            input.actorKind,
            input.actorId,
            input.clientId,
            input.requestHash,
            input.claimedAt,
            input.leaseExpiresAt,
            input.correlationId,
            input.idempotencyKey,
            input.claimedAt,
            input.claimedAt,
          );
        const inserted = this.findById(input.id);
        if (inserted === null) throw new Error("COMMAND_RECEIPT_INSERT_FAILED");
        return { kind: "claimed", recovered: false, receipt: inserted } as const;
      }

      if (existing.requestHash !== input.requestHash) {
        return { kind: "conflict" } as const;
      }
      if (existing.status === "succeeded") {
        return { kind: "replay_succeeded", receipt: existing } as const;
      }
      if (existing.status === "failed") {
        return { kind: "replay_failed", receipt: existing } as const;
      }
      if (existing.leaseExpiresAt > input.claimedAt) {
        return { kind: "in_progress", receipt: existing } as const;
      }

      const updated = this.database.$client
        .prepare(
          `UPDATE command_receipts
           SET lease_expires_at = ?, updated_at = ?
           WHERE id = ? AND status = 'in_progress'
             AND request_hash = ? AND lease_expires_at <= ?`,
        )
        .run(
          input.leaseExpiresAt,
          input.claimedAt,
          existing.id,
          input.requestHash,
          input.claimedAt,
        );
      if (updated.changes !== 1) {
        const current = this.findById(existing.id);
        if (current === null) return { kind: "conflict" } as const;
        return current.status === "succeeded"
          ? ({ kind: "replay_succeeded", receipt: current } as const)
          : current.status === "failed"
            ? ({ kind: "replay_failed", receipt: current } as const)
            : ({ kind: "in_progress", receipt: current } as const);
      }
      const recovered = this.findById(existing.id);
      if (recovered === null) throw new Error("COMMAND_RECEIPT_RECOVERY_FAILED");
      return { kind: "claimed", recovered: true, receipt: recovered } as const;
    });

    try {
      return transaction.immediate();
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
        const existing = this.findBySemanticKey(input);
        if (existing === null || existing.requestHash !== input.requestHash) {
          return { kind: "conflict" };
        }
        return existing.status === "succeeded"
          ? { kind: "replay_succeeded", receipt: existing }
          : existing.status === "failed"
            ? { kind: "replay_failed", receipt: existing }
            : { kind: "in_progress", receipt: existing };
      }
      throw error;
    }
  }

  async finalize(
    input: CommandReceiptFinalization,
  ): Promise<CommandReceiptRecord | null> {
    if (!finalizationValid(input)) return null;
    const existing = this.findById(input.receiptId);
    if (
      existing === null ||
      existing.status !== "in_progress" ||
      existing.requestHash !== input.requestHash ||
      input.completedAt < existing.claimedAt
    ) {
      return null;
    }

    const result =
      input.kind === "success"
        ? this.database.$client
            .prepare(
              `UPDATE command_receipts
               SET status = 'succeeded', result_hash = ?,
                   result_summary_json = ?, completed_at = ?, updated_at = ?
               WHERE id = ? AND request_hash = ? AND status = 'in_progress'`,
            )
            .run(
              input.resultHash,
              input.resultSummaryJson,
              input.completedAt,
              input.completedAt,
              input.receiptId,
              input.requestHash,
            )
        : this.database.$client
            .prepare(
              `UPDATE command_receipts
               SET status = 'failed', stable_error_code = ?, retryable = ?,
                   completed_at = ?, updated_at = ?
               WHERE id = ? AND request_hash = ? AND status = 'in_progress'`,
            )
            .run(
              input.stableErrorCode,
              input.retryable ? 1 : 0,
              input.completedAt,
              input.completedAt,
              input.receiptId,
              input.requestHash,
            );
    return result.changes === 1 ? this.findById(input.receiptId) : null;
  }

  private findById(id: string): CommandReceiptRecord | null {
    const row = this.database.$client
      .prepare("SELECT * FROM command_receipts WHERE id = ?")
      .get(id) as ReceiptRow | undefined;
    return row === undefined ? null : fromRow(row);
  }

  private findBySemanticKey(
    input: CommandReceiptClaimInput,
  ): CommandReceiptRecord | null {
    const row = this.database.$client
      .prepare(
        `SELECT * FROM command_receipts
         WHERE owner_id = ? AND actor_kind = ? AND actor_id = ?
           AND client_id = ? AND command_id = ? AND command_version = ?
           AND resource_type = ? AND resource_id = ? AND idempotency_key = ?`,
      )
      .get(
        input.ownerId,
        input.actorKind,
        input.actorId,
        input.clientId,
        input.commandId,
        input.commandVersion,
        input.resourceType,
        input.resourceId,
        input.idempotencyKey,
      ) as ReceiptRow | undefined;
    return row === undefined ? null : fromRow(row);
  }
}
