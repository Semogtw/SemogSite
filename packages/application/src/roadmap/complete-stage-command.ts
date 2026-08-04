import type { CommandDefinition } from "../command-registry";

export type CompleteStagePayload = {
  stageId: string;
  reason: string;
};

export type CompleteStageResult = {
  stageId: string;
  status: "completed";
};

const expectedKeys = new Set(["reason", "stageId"]);

function invalid(): never {
  throw new Error("STAGE_COMPLETION_INPUT_INVALID");
}

function parsePayload(value: unknown): CompleteStagePayload {
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

  const stageIdValue = descriptors.stageId!.value;
  const reasonValue = descriptors.reason!.value;
  if (typeof stageIdValue !== "string" || typeof reasonValue !== "string") {
    invalid();
  }

  const stageId = stageIdValue.trim();
  const reason = reasonValue.trim();
  if (
    stageId.length < 1 ||
    stageId.length > 200 ||
    reason.length < 1 ||
    reason.length > 500
  ) {
    invalid();
  }
  return { stageId, reason };
}

export const completeStageCommand: CommandDefinition<
  CompleteStagePayload,
  CompleteStageResult
> = {
  commandId: "roadmap.stages.complete",
  commandVersion: 1,
  schema: { parse: parsePayload },
  capability: "roadmap.write",
  resourceType: "stage",
  bindResource(payload) {
    return { resourceType: "stage", resourceId: payload.stageId };
  },
  riskFloor: "high",
  confirmation: "approve_in_devos",
  conflictStrategy: "exact_snapshot",
  idempotencyStrategy: "required_receipt",
  undoStrategy: "compensating_command",
  auditStrategy: "state_and_receipt",
  execution: "registered_blocked",
};
