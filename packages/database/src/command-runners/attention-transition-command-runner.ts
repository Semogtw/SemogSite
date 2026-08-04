import type { TransitionAttentionPayload } from "@semogtw/application";
import {
  planAttentionLifecycleTransition,
  validateAttentionLifecycleTransition,
} from "@semogtw/domain/attention";
import { createHash } from "node:crypto";
import type { SqliteDatabase } from "../adapters/sqlite";
import { SqliteAttentionLifecycleRepository } from "../repositories/attention-lifecycle-repository";
import type {
  SqliteCommandExecutionContext,
  SqliteCommandRunner,
  SqliteCommandRunnerFailure,
} from "../repositories/sqlite-command-executor";

const isoTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

function failure(
  stableErrorCode: string,
  retryable = false,
): SqliteCommandRunnerFailure {
  return { kind: "failure", stableErrorCode, retryable };
}

function timestampValid(value: string): boolean {
  return (
    isoTimestampPattern.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function auditId(receiptId: string): string {
  const digest = createHash("sha256").update(receiptId, "utf8").digest("hex");
  return `audit-command-${digest}`;
}

function contextMatches(
  context: SqliteCommandExecutionContext,
  payload: TransitionAttentionPayload,
): boolean {
  return (
    context.commandId === "attention.transition" &&
    context.commandVersion === 1 &&
    context.capability === "attention.write" &&
    context.resourceType === "attention_item" &&
    context.resourceId === payload.attentionId &&
    context.ownerId.length > 0 &&
    context.actorId.length > 0 &&
    context.correlationId.length > 0
  );
}

export function createAttentionTransitionCommandRunner(input: {
  database: SqliteDatabase;
  payload: TransitionAttentionPayload;
  expectedUpdatedAt: string;
  now: string;
}): SqliteCommandRunner {
  return (context) => {
    if (
      !contextMatches(context, input.payload) ||
      !timestampValid(input.expectedUpdatedAt) ||
      !timestampValid(input.now)
    ) {
      return failure("COMMAND_VALIDATION_FAILED");
    }

    const validated = validateAttentionLifecycleTransition({
      ...input.payload,
      confirmed: true,
    });
    if (!validated.ok) return failure("COMMAND_VALIDATION_FAILED");

    const repository = new SqliteAttentionLifecycleRepository(input.database);
    const before = repository.findByIdSync(validated.value.attentionId);
    if (before === null) return failure("COMMAND_TARGET_NOT_FOUND");
    if (before.updatedAt !== input.expectedUpdatedAt) {
      return failure("COMMAND_TARGET_CHANGED");
    }

    const planned = planAttentionLifecycleTransition(
      validated.value,
      {
        actorId: context.actorId,
        auditId: auditId(context.receiptId),
        correlationId: context.correlationId,
        now: input.now,
      },
      before,
    );
    if (!planned.ok) {
      return planned.code === "NOT_FOUND"
        ? failure("COMMAND_TARGET_NOT_FOUND")
        : failure("COMMAND_TARGET_CHANGED");
    }

    const transitioned = repository.transitionWithAuditSync(
      planned.audit.before,
      planned.attention,
      planned.audit,
    );
    if (!transitioned) return failure("COMMAND_TARGET_CHANGED");

    return {
      kind: "success",
      auditEventId: planned.audit.id,
      summary: {
        attentionId: planned.attention.id,
        status: planned.attention.status,
        updatedAt: planned.attention.updatedAt,
      },
    };
  };
}
