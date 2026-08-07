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
const commandIdPattern = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u;
const capabilityPattern = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u;
const resourceTypePattern = /^[a-z][a-z0-9_-]*$/u;

function invalid(): never {
  throw new Error("COMMAND_RECEIPT_INVALID");
}

function bounded(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maximum &&
    value.trim() === value
  );
}

function dataObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string") return false;
    const descriptor = descriptors[key];
    return (
      descriptor !== undefined &&
      descriptor.enumerable &&
      "value" in descriptor &&
      descriptor.get === undefined &&
      descriptor.set === undefined
    );
  });
}

function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
): boolean {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return (
    keys.length === sortedExpected.length &&
    keys.every((key, index) => key === sortedExpected[index])
  );
}

type ClaimActor = {
  kind: CommandReceiptClaim["actorKind"];
  actorId: string;
  clientId: string;
};

function claimActor(value: unknown): ClaimActor | null {
  if (!dataObject(value) || typeof value.kind !== "string") return null;
  if (value.kind === "owner_ui" || value.kind === "system") {
    return exactKeys(value, ["actorId", "kind"]) && bounded(value.actorId, 200)
      ? { kind: value.kind, actorId: value.actorId, clientId: "" }
      : null;
  }
  if (value.kind === "mcp_client") {
    const keys = Object.keys(value);
    const allowed = new Set([
      "actorId",
      "clientId",
      "declaredModel",
      "declaredProvider",
      "kind",
    ]);
    return (
      keys.every((key) => allowed.has(key)) &&
      Object.hasOwn(value, "actorId") &&
      Object.hasOwn(value, "clientId") &&
      bounded(value.actorId, 200) &&
      bounded(value.clientId, 200) &&
      (value.declaredProvider === undefined ||
        bounded(value.declaredProvider, 120)) &&
      (value.declaredModel === undefined || bounded(value.declaredModel, 120))
    )
      ? {
          kind: "mcp_client",
          actorId: value.actorId,
          clientId: value.clientId,
        }
      : null;
  }
  if (value.kind === "external_adapter") {
    return (
      exactKeys(value, ["actorId", "adapterId", "kind"]) &&
      bounded(value.actorId, 200) &&
      bounded(value.adapterId, 200)
    )
      ? {
          kind: "external_adapter",
          actorId: value.actorId,
          clientId: value.adapterId,
        }
      : null;
  }
  return null;
}

function preparedClaimData(prepared: PreparedCommand): Omit<
  CommandReceiptClaim,
  "id" | "claimedAt" | "leaseExpiresAt"
> | null {
  if (
    !dataObject(prepared) ||
    !exactKeys(prepared, [
      "capability",
      "commandId",
      "commandVersion",
      "context",
      "decision",
      "expected",
      "expectedHash",
      "manifest",
      "payload",
      "payloadHash",
      "requestHash",
      "target",
    ]) ||
    !bounded(prepared.commandId, 160) ||
    !commandIdPattern.test(prepared.commandId) ||
    !Number.isInteger(prepared.commandVersion) ||
    prepared.commandVersion < 1 ||
    !bounded(prepared.capability, 160) ||
    !capabilityPattern.test(prepared.capability) ||
    !hashPattern.test(prepared.requestHash) ||
    !dataObject(prepared.decision) ||
    !exactKeys(prepared.decision, [
      "approvalId",
      "outcome",
      "reasonCode",
      "risk",
    ]) ||
    prepared.decision.outcome !== "allow" ||
    !dataObject(prepared.target) ||
    !exactKeys(prepared.target, ["resourceId", "resourceType"]) ||
    !bounded(prepared.target.resourceType, 120) ||
    !resourceTypePattern.test(prepared.target.resourceType) ||
    !bounded(prepared.target.resourceId, 500) ||
    !dataObject(prepared.context) ||
    !exactKeys(prepared.context, [
      "actor",
      "approvalId",
      "confirmed",
      "correlationId",
      "idempotencyKey",
      "ownerId",
      "reason",
    ]) ||
    !bounded(prepared.context.ownerId, 200) ||
    !bounded(prepared.context.correlationId, 200) ||
    !bounded(prepared.context.idempotencyKey, 200)
  ) {
    return null;
  }

  const actor = claimActor(prepared.context.actor);
  if (actor === null) return null;
  return {
    ownerId: prepared.context.ownerId,
    commandId: prepared.commandId,
    commandVersion: prepared.commandVersion,
    capability: prepared.capability,
    resourceType: prepared.target.resourceType,
    resourceId: prepared.target.resourceId,
    actorKind: actor.kind,
    actorId: actor.actorId,
    clientId: actor.clientId,
    requestHash: prepared.requestHash,
    correlationId: prepared.context.correlationId,
    idempotencyKey: prepared.context.idempotencyKey,
  };
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
    !dataObject(input) ||
    !exactKeys(input, ["claimedAt", "leaseExpiresAt", "receiptId"]) ||
    !bounded(input.receiptId, 200) ||
    !isCanonicalUtcTimestamp(input.claimedAt) ||
    !isCanonicalUtcTimestamp(input.leaseExpiresAt) ||
    input.leaseExpiresAt <= input.claimedAt
  ) {
    invalid();
  }

  const preparedData = preparedClaimData(prepared);
  if (preparedData === null) invalid();
  return {
    id: input.receiptId,
    ...preparedData,
    claimedAt: input.claimedAt,
    leaseExpiresAt: input.leaseExpiresAt,
  };
}

export async function createReceiptSuccess(input: {
  receiptId: string;
  requestHash: string;
  summary: Readonly<Record<string, JsonValue>>;
  completedAt: string;
}): Promise<CommandReceiptSuccess> {
  if (
    !dataObject(input) ||
    !exactKeys(input, ["completedAt", "receiptId", "requestHash", "summary"]) ||
    !bounded(input.receiptId, 200) ||
    !hashPattern.test(input.requestHash) ||
    !isCanonicalUtcTimestamp(input.completedAt)
  ) {
    invalid();
  }

  let resultSummaryJson: string;
  try {
    resultSummaryJson = canonicalJson(input.summary);
  } catch {
    invalid();
  }
  if (new TextEncoder().encode(resultSummaryJson).byteLength > 4000) invalid();
  const summary = JSON.parse(resultSummaryJson) as JsonValue;
  return {
    kind: "success",
    receiptId: input.receiptId,
    requestHash: input.requestHash,
    resultHash: await canonicalSha256(summary),
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
    !dataObject(input) ||
    !exactKeys(input, [
      "completedAt",
      "receiptId",
      "requestHash",
      "retryable",
      "stableErrorCode",
    ]) ||
    !bounded(input.receiptId, 200) ||
    !hashPattern.test(input.requestHash) ||
    typeof input.stableErrorCode !== "string" ||
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
