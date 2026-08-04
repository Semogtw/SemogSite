import { canonicalJson, canonicalSha256 } from "./canonical-json";
import type { PreparedCommand } from "./command-gateway";
import type { JsonValue } from "./core";
import { isCanonicalUtcTimestamp } from "./iso-timestamp";

export const commandReceiptStatuses = [
  "in_progress",
  "succeeded",
  "failed",
] as const;

export type CommandReceiptStatus = (typeof commandReceiptStatuses)[number];

export type CommandReceiptClaim = {
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

export type CommandReceiptRecord = CommandReceiptClaim & {
  status: CommandReceiptStatus;
  resultHash: string | null;
  resultSummaryJson: string | null;
  stableErrorCode: string | null;
  retryable: boolean | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CommandReceiptSuccess = {
  kind: "success";
  receiptId: string;
  requestHash: string;
  resultHash: string;
  resultSummaryJson: string;
  stableErrorCode: null;
  retryable: null;
  completedAt: string;
};

export type CommandReceiptFailure = {
  kind: "failure";
  receiptId: string;
  requestHash: string;
  resultHash: null;
  resultSummaryJson: null;
  stableErrorCode: string;
  retryable: boolean;
  completedAt: string;
};

export type CommandReceiptFinalization =
  | CommandReceiptSuccess
  | CommandReceiptFailure;

export type CommandReceiptClaimOutcome =
  | { kind: "claimed"; receipt: CommandReceiptRecord }
  | { kind: "in_progress"; receipt: CommandReceiptRecord }
  | { kind: "replay_succeeded"; receipt: CommandReceiptRecord }
  | { kind: "replay_failed"; receipt: CommandReceiptRecord }
  | { kind: "conflict" };

export interface CommandReceiptStore {
  claim(input: CommandReceiptClaim): Promise<CommandReceiptClaimOutcome>;
  finalize(
    input: CommandReceiptFinalization,
  ): Promise<CommandReceiptRecord | null>;
}

const hashPattern = /^[a-f0-9]{64}$/u;
const stableErrorPattern = /^[A-Z][A-Z0-9_]{0,119}$/u;

function invalid(): never {
  throw new Error("COMMAND_RECEIPT_INVALID");
}

function bounded(value: string, maximum: number): boolean {
  return value.length >= 1 && value.length <= maximum && value.trim() === value;
}

function clientIdentity(prepared: PreparedCommand): string {
  switch (prepared.context.actor.kind) {
    case "mcp_client":
      return prepared.context.actor.clientId;
    case "external_adapter":
      return prepared.context.actor.adapterId;
    case "owner_ui":
    case "system":
      return "";
  }
}

export function createReceiptClaim(
  prepared: PreparedCommand,
  input: {
    receiptId: string;
    claimedAt: string;
    leaseExpiresAt: string;
  },
): CommandReceiptClaim {
  if (
    prepared.decision.outcome !== "allow" ||
    !bounded(input.receiptId, 200) ||
    !hashPattern.test(prepared.requestHash) ||
    !isCanonicalUtcTimestamp(input.claimedAt) ||
    !isCanonicalUtcTimestamp(input.leaseExpiresAt) ||
    input.leaseExpiresAt <= input.claimedAt
  ) {
    invalid();
  }

  const clientId = clientIdentity(prepared);
  if (clientId.length > 200 || clientId.trim() !== clientId) invalid();

  return {
    id: input.receiptId,
    ownerId: prepared.context.ownerId,
    commandId: prepared.commandId,
    commandVersion: prepared.commandVersion,
    capability: prepared.capability,
    resourceType: prepared.target.resourceType,
    resourceId: prepared.target.resourceId,
    actorKind: prepared.context.actor.kind,
    actorId: prepared.context.actor.actorId,
    clientId,
    requestHash: prepared.requestHash,
    claimedAt: input.claimedAt,
    leaseExpiresAt: input.leaseExpiresAt,
    correlationId: prepared.context.correlationId,
    idempotencyKey: prepared.context.idempotencyKey,
  };
}

export async function createReceiptSuccess(input: {
  receiptId: string;
  requestHash: string;
  summary: Readonly<Record<string, JsonValue>>;
  completedAt: string;
}): Promise<CommandReceiptSuccess> {
  if (
    !bounded(input.receiptId, 200) ||
    !hashPattern.test(input.requestHash) ||
    !isCanonicalUtcTimestamp(input.completedAt)
  ) {
    invalid();
  }
  const resultSummaryJson = canonicalJson(input.summary);
  if (new TextEncoder().encode(resultSummaryJson).byteLength > 4000) invalid();
  return {
    kind: "success",
    receiptId: input.receiptId,
    requestHash: input.requestHash,
    resultHash: await canonicalSha256(input.summary),
    resultSummaryJson,
    stableErrorCode: null,
    retryable: null,
    completedAt: input.completedAt,
  };
}

export function createReceiptFailure(input: {
  receiptId: string;
  requestHash: string;
  stableErrorCode: string;
  retryable: boolean;
  completedAt: string;
}): CommandReceiptFailure {
  if (
    !bounded(input.receiptId, 200) ||
    !hashPattern.test(input.requestHash) ||
    !stableErrorPattern.test(input.stableErrorCode) ||
    typeof input.retryable !== "boolean" ||
    !isCanonicalUtcTimestamp(input.completedAt)
  ) {
    invalid();
  }
  return {
    kind: "failure",
    receiptId: input.receiptId,
    requestHash: input.requestHash,
    resultHash: null,
    resultSummaryJson: null,
    stableErrorCode: input.stableErrorCode,
    retryable: input.retryable,
    completedAt: input.completedAt,
  };
}
