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

export type SqliteCommandRunner = () => SqliteCommandRunnerResult;

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

const stableErrorPattern = /^[A-Z][A-Z0-9_]{0,119}$/u;

function jsonString(value: string | number): string {
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("COMMAND_RESULT_INVALID");
  return encoded;
}

function canonicalJson(value: unknown, active = new WeakSet<object>()): string {
  if (value === null) return "null";
  if (typeof value === "string") return jsonString(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("COMMAND_RESULT_INVALID");
    return Object.is(value, -0) ? "0" : jsonString(value);
  }
  if (typeof value !== "object") throw new Error("COMMAND_RESULT_INVALID");
  if (active.has(value)) throw new Error("COMMAND_RESULT_INVALID");
  active.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          throw new Error("COMMAND_RESULT_INVALID");
        }
      }
      return `[${value.map((item) => canonicalJson(item, active)).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error("COMMAND_RESULT_INVALID");
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(value);
    if (keys.some((key) => typeof key !== "string")) {
      throw new Error("COMMAND_RESULT_INVALID");
    }
    const stringKeys = keys as string[];
    for (const key of stringKeys) {
      const descriptor = descriptors[key];
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor) ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined
      ) {
        throw new Error("COMMAND_RESULT_INVALID");
      }
    }
    return `{${stringKeys
      .sort()
      .map(
        (key) =>
          `${jsonString(key)}:${canonicalJson(descriptors[key]!.value, active)}`,
      )
      .join(",")}}`;
  } finally {
    active.delete(value);
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseSummary(value: string | null): Readonly<Record<string, unknown>> {
  if (value === null) return {};
  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("COMMAND_RECEIPT_RESULT_INVALID");
  }
  return parsed as Readonly<Record<string, unknown>>;
}

function failureFromRunner(result: SqliteCommandRunnerFailure): ControlledExecutionFailure {
  return stableErrorPattern.test(result.stableErrorCode)
    ? new ControlledExecutionFailure(result.stableErrorCode, result.retryable)
    : new ControlledExecutionFailure("COMMAND_RUNNER_FAILURE_INVALID", false);
}

function asyncRunner(runner: SqliteCommandRunner): boolean {
  return runner.constructor.name === "AsyncFunction";
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
    const claimed = await this.receipts.claim(input.claim);
    if (claimed.kind === "conflict") return { kind: "conflict" };
    if (claimed.kind === "in_progress") {
      return { kind: "in_progress", receiptId: claimed.receipt.id };
    }
    if (claimed.kind === "replay_succeeded") {
      return {
        kind: "succeeded",
        replayed: true,
        receiptId: claimed.receipt.id,
        summary: parseSummary(claimed.receipt.resultSummaryJson),
      };
    }
    if (claimed.kind === "replay_failed") {
      return {
        kind: "failed",
        replayed: true,
        receiptId: claimed.receipt.id,
        stableErrorCode:
          claimed.receipt.stableErrorCode ?? "COMMAND_RECEIPT_RESULT_INVALID",
        retryable: claimed.receipt.retryable ?? false,
      };
    }

    const receipt = claimed.receipt;
    try {
      const transaction = this.database.$client.transaction(() => {
        if (asyncRunner(runner)) {
          throw new ControlledExecutionFailure(
            "COMMAND_RUNNER_ASYNC_FORBIDDEN",
            false,
          );
        }
        const result = runner();
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

        const resultSummaryJson = canonicalJson(result.summary);
        if (resultSummaryJson.length > 4000) {
          throw new ControlledExecutionFailure(
            "COMMAND_RESULT_TOO_LARGE",
            false,
          );
        }
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
