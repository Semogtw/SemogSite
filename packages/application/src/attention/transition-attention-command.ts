import type { CommandDefinition } from "../command-registry";

export type TransitionAttentionPayload = {
  attentionId: string;
  targetStatus: "resolved" | "dismissed";
  reason: string;
};

export type TransitionAttentionResult = {
  attentionId: string;
  status: "resolved" | "dismissed";
};

const expectedKeys = new Set(["attentionId", "reason", "targetStatus"]);

function invalid(): never {
  throw new Error("ATTENTION_TRANSITION_INPUT_INVALID");
}

function parsePayload(value: unknown): TransitionAttentionPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) invalid();
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid();

  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== expectedKeys.size ||
    keys.some((key) => typeof key !== "string" || !expectedKeys.has(key))
  ) {
    invalid();
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (const key of expectedKeys) {
    const descriptor = descriptors[key];
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !("value" in descriptor) ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined
    ) {
      invalid();
    }
  }

  const attentionIdValue = descriptors.attentionId!.value;
  const targetStatusValue = descriptors.targetStatus!.value;
  const reasonValue = descriptors.reason!.value;
  if (
    typeof attentionIdValue !== "string" ||
    typeof reasonValue !== "string" ||
    (targetStatusValue !== "resolved" && targetStatusValue !== "dismissed")
  ) {
    invalid();
  }

  const attentionId = attentionIdValue.trim();
  const reason = reasonValue.trim();
  if (
    attentionId.length < 1 ||
    attentionId.length > 200 ||
    reason.length < 1 ||
    reason.length > 500
  ) {
    invalid();
  }

  return {
    attentionId,
    targetStatus: targetStatusValue,
    reason,
  };
}

export const transitionAttentionCommand: CommandDefinition<
  TransitionAttentionPayload,
  TransitionAttentionResult
> = {
  commandId: "attention.transition",
  commandVersion: 1,
  schema: { parse: parsePayload },
  capability: "attention.write",
  resourceType: "attention_item",
  bindResource(payload) {
    return {
      resourceType: "attention_item",
      resourceId: payload.attentionId,
    };
  },
  riskFloor: "medium",
  confirmation: "confirm_in_client",
  conflictStrategy: "expected_timestamp",
  idempotencyStrategy: "required_receipt",
  undoStrategy: "compensating_command",
  auditStrategy: "state_and_receipt",
  execution: "enabled",
};
