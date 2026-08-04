import {
  canonicalJson,
  isCanonicalUtcTimestamp,
} from "@semogtw/application";
import { createHash } from "node:crypto";
import type { SqliteDatabase } from "../adapters/sqlite";
import {
  SqliteCommandReceiptRepository,
  type CommandReceiptClaimInput,
  type CommandReceiptRecord,
} from "./command-receipt-repository";

export type SqliteCommandRunnerSuccess = {
  kind: "success";
  auditEventId: string;
  summary: Readonly<Record<string, unknown>>;
};

export type SqliteCommandRunnerFailure = {
  kind: "failure";
  stableErrorCode: string;
  retryable: boolean;
};

export type SqliteCommandRunnerResult =
  | SqliteCommandRunnerSuccess
  | SqliteCommandRunnerFailure;

export type SqliteCommandExecutionContext = {
  receiptId: string;
  recovered: boolean;
  ownerId: string;
  commandId: string;
  commandVersion: number;
  capability: string;
  resourceType: string;
  resourceId: string;
  actorKind: CommandReceiptRecord["actorKind"];
  actorId: string;
  clientId: string;
  requestHash: string;
  correlationId: string;
  idempotencyKey: string;
};

export type SqliteCommandRunner = (
  context: SqliteCommandExecutionContext,
) => SqliteCommandRunnerResult;

export type SqliteCommandExecutionResult =
  | {
      kind: "succeeded";
      replayed: boolean;
      receiptId: string;
      summary: Readonly<Record<string, unknown>>;
    }
  | {
      kind: "failed";
      replayed: boolean;
      receiptId: string;
      stableErrorCode: string;
      retryable: boolean;
    }
  | { kind: "in_progress"; receiptId: string }
  | { kind: "conflict" };

class ControlledExecutionFailure extends Error {
  constructor(
    readonly stableErrorCode: string,
    readonly retryable: boolean,
  ) {
    super(stableErrorCode);
  }
}

const hashPattern = /^[a-f0-9]{64}$/u;
const stableErrorPattern = /^[A-Z][A-Z0-9_]{0,119}$/u;

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function invalidReplay(receipt: CommandReceiptRecord): SqliteCommandExecutionResult {
  return {
    kind: "failed",
    replayed: true,
    receiptId: receipt.id,
    stableErrorCode: "COMMAND_RECEIPT_RESULT_INVALID",
    retryable: false,
  };
}

function finalReceiptTimesValid(receipt: CommandReceiptRecord): boolean {
  const completedAt = receipt.completedAt;
  return (
    isCanonicalUtcTimestamp(receipt.claimedAt) &&
    isCanonicalUtcTimestamp(receipt.leaseExpiresAt) &&
    isCanonicalUtcTimestamp(receipt.createdAt) &&
    isCanonicalUtcTimestamp(receipt.updatedAt) &&
    isCanonicalUtcTimestamp(completedAt) &&
    receipt.createdAt === receipt.claimedAt &&
    receipt.leaseExpiresAt > receipt.claimedAt &&
    completedAt >= receipt.claimedAt &&
    receipt.updatedAt === completedAt
  );
}

function retryableFailureValid(receipt: CommandReceiptRecord): boolean {
  return (
    (receipt.retryableStorageValue === 0 && receipt.retryable === false) ||
    (receipt.retryableStorageValue === 1 && receipt.retryable === true)
  );
}

function replaySuccess(
  receipt: CommandReceiptRecord,
): SqliteCommandExecutionResult {
  const serialized = receipt.resultSummaryJson;
  const resultHash = receipt.resultHash;
  if (
    serialized === null ||
    resultHash === null ||
    !hashPattern.test(resultHash) ||
    receipt.stableErrorCode !== null ||
    receipt.retryable !== null ||
    receipt.retryableStorageValue !== null ||
    !finalReceiptTimesValid(receipt) ||
    Buffer.byteLength(serialized, "utf8") > 4000 ||
    sha256(serialized) !== resultHash
  ) {
    return invalidReplay(receipt);
  }

  try {
    const parsed = JSON.parse(serialized) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return invalidReplay(receipt);
    }
    const summary = parsed as Readonly<Record<string, unknown>>;
    if (canonicalJson(summary) !== serialized) return invalidReplay(receipt);
    return {
      kind: "succeeded",
      replayed: true,
      receiptId: receipt.id,
      summary,
    };
  } catch {
    return invalidReplay(receipt);
  }
}

function replayFailure(
  receipt: CommandReceiptRecord,
): SqliteCommandExecutionResult {
  if (
    receipt.resultHash !== null ||
    receipt.resultSummaryJson !== null ||
    receipt.stableErrorCode === null ||
    !stableErrorPattern.test(receipt.stableErrorCode) ||
    !retryableFailureValid(receipt) ||
    !finalReceiptTimesValid(receipt)
  ) {
    return invalidReplay(receipt);
  }
  return {
    kind: "failed",
    replayed: true,
    receiptId: receipt.id,
    stableErrorCode: receipt.stableErrorCode,
    retryable: receipt.retryable,
  };
}

function serializeSummary(
  summary: Readonly<Record<string, unknown>>,
): string {
  try {
    const serialized = canonicalJson(summary);
    if (Buffer.byteLength(serialized, "utf8") > 4000) {
      throw new ControlledExecutionFailure(
        "COMMAND_RESULT_TOO_LARGE",
        false,
      );
    }
    return serialized;
  } catch (error) {
    if (error instanceof ControlledExecutionFailure) throw error;
    throw new ControlledExecutionFailure("COMMAND_RESULT_INVALID", false);
  }
}

function failureFromRunner(result: SqliteCommandRunnerFailure): ControlledExecutionFailure {
  return stableErrorPattern.test(result.stableErrorCode)
    ? new ControlledExecutionFailure(result.stableErrorCode, result.retryable)
    : new ControlledExecutionFailure("COMMAND_RUNNER_FAILURE_INVALID", false);
}

function asyncRunner(runner: SqliteCommandRunner): boolean {
  return runner.constructor.name === "AsyncFunction";
}

function executionContext(
  receipt: CommandReceiptRecord,
  recovered: boolean,
): SqliteCommandExecutionContext {
  return {
    receiptId: receipt.id,
    recovered,
    ownerId: receipt.ownerId,
    commandId: receipt.commandId,
    commandVersion: receipt.commandVersion,
    capability: receipt.capability,
    resourceType: receipt.resourceType,
    resourceId: receipt.resourceId,
    actorKind: receipt.actorKind,
    actorId: receipt.actorId,
    clientId: receipt.clientId,
    requestHash: receipt.requestHash,
    correlationId: receipt.correlationId,
    idempotencyKey: receipt.idempotencyKey,
  };
}

export class SqliteTransactionalCommandExecutor {
  constructor(
    private readonly database: SqliteDatabase,
    private readonly receipts: SqliteCommandReceiptRepository,
  ) {}

  async execute(
    input: {
      claim: CommandReceiptClaimInput;
      completedAt: string;
    },
    runner: SqliteCommandRunner,
  ): Promise<SqliteCommandExecutionResult> {
    if (
      !isCanonicalUtcTimestamp(input.completedAt) ||
      input.completedAt < input.claim.claimedAt
    ) {
      throw new Error("COMMAND_EXECUTION_TIME_INVALID");
    }

    const claimed = await this.receipts.claim(input.claim);
    if (claimed.kind === "conflict") return { kind: "conflict" };
    if (claimed.kind === "corrupt") return invalidReplay(claimed.receipt);
    if (claimed.kind === "in_progress") {
      return { kind: "in_progress", receiptId: claimed.receipt.id };
    }
    if (claimed.kind === "replay_succeeded") {
      return replaySuccess(claimed.receipt);
    }
    if (claimed.kind === "replay_failed") {
      return replayFailure(claimed.receipt);
    }

    const receipt = claimed.receipt;
    const context = executionContext(receipt, claimed.recovered);
    try {
      const transaction = this.database.$client.transaction(() => {
        if (asyncRunner(runner)) {
          throw new ControlledExecutionFailure(
            "COMMAND_RUNNER_ASYNC_FORBIDDEN",
            false,
          );
        }
        const result = runner(context);
        if (
          typeof result === "object" &&
          result !== null &&
          "then" in result &&
          typeof (result as { then?: unknown }).then === "function"
        ) {
          throw new ControlledExecutionFailure(
            "COMMAND_RUNNER_ASYNC_FORBIDDEN",
            false,
          );
        }
        if (result.kind === "failure") throw failureFromRunner(result);
        this.requireAudit(result.auditEventId, receipt);

        const resultSummaryJson = serializeSummary(result.summary);
        const updated = this.database.$client
          .prepare(
            `UPDATE command_receipts
             SET status = 'succeeded', result_hash = ?,
                 result_summary_json = ?, completed_at = ?, updated_at = ?
             WHERE id = ? AND request_hash = ? AND status = 'in_progress'`,
          )
          .run(
            sha256(resultSummaryJson),
            resultSummaryJson,
            input.completedAt,
            input.completedAt,
            receipt.id,
            receipt.requestHash,
          );
        if (updated.changes !== 1) {
          throw new ControlledExecutionFailure(
            "COMMAND_RECEIPT_FINALIZE_CONFLICT",
            true,
          );
        }
        return {
          kind: "succeeded" as const,
          replayed: false,
          receiptId: receipt.id,
          summary: result.summary,
        };
      });
      return transaction.immediate();
    } catch (error) {
      const controlled =
        error instanceof ControlledExecutionFailure
          ? error
          : new ControlledExecutionFailure("COMMAND_EXECUTION_FAILED", true);
      const finalized = await this.receipts.finalize({
        kind: "failure",
        receiptId: receipt.id,
        requestHash: receipt.requestHash,
        resultHash: null,
        resultSummaryJson: null,
        stableErrorCode: controlled.stableErrorCode,
        retryable: controlled.retryable,
        completedAt: input.completedAt,
      });
      return {
        kind: "failed",
        replayed: false,
        receiptId: receipt.id,
        stableErrorCode:
          finalized?.stableErrorCode ?? "COMMAND_RECEIPT_FINALIZE_CONFLICT",
        retryable: finalized?.retryable ?? true,
      };
    }
  }

  private requireAudit(
    auditEventId: string,
    receipt: CommandReceiptRecord,
  ): void {
    if (auditEventId.trim() !== auditEventId || auditEventId.length < 1) {
      throw new ControlledExecutionFailure("COMMAND_AUDIT_MISSING", false);
    }
    const audit = this.database.$client
      .prepare(
        `SELECT id FROM audit_events
         WHERE id = ? AND correlation_id = ? AND entity_type = ?
           AND entity_id = ?`,
      )
      .get(
        auditEventId,
        receipt.correlationId,
        receipt.resourceType,
        receipt.resourceId,
      ) as { id: string } | undefined;
    if (audit === undefined) {
      throw new ControlledExecutionFailure("COMMAND_AUDIT_MISSING", false);
    }
  }
}
