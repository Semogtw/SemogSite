import { canonicalJson, canonicalSha256 } from "./canonical-json";
import type {
  CommandActor,
  CommandContext,
  CommandTarget,
  JsonValue,
  PolicyDecision,
} from "./core";
import {
  CommandRegistry,
  type CommandManifest,
} from "./command-registry";

export type CommandPolicy = {
  evaluate(
    manifest: CommandManifest,
    context: CommandContext,
    target: CommandTarget,
  ): PolicyDecision;
};

export type PreparedCommand = {
  commandId: string;
  commandVersion: number;
  capability: string;
  target: CommandTarget;
  payload: JsonValue;
  expected: Readonly<Record<string, JsonValue>>;
  context: CommandContext;
  manifest: CommandManifest;
  decision: PolicyDecision;
  payloadHash: string;
  expectedHash: string;
  requestHash: string;
};

const commandIdPattern = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/u;
const resourceTypePattern = /^[a-z][a-z0-9_-]*$/u;

function bounded(value: string, maximum: number): boolean {
  return (
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
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) return false;
  return (keys as string[]).every((key) => {
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

function keysValid(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  const allowed = new Set([...required, ...optional]);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => allowed.has(key))
  );
}

function actorValid(value: unknown): value is CommandActor {
  if (!dataObject(value) || typeof value.kind !== "string") return false;

  if (value.kind === "owner_ui" || value.kind === "system") {
    return (
      keysValid(value, ["kind", "actorId"]) &&
      typeof value.actorId === "string" &&
      bounded(value.actorId, 200)
    );
  }

  if (value.kind === "mcp_client") {
    return (
      keysValid(
        value,
        ["kind", "actorId", "clientId"],
        ["declaredProvider", "declaredModel"],
      ) &&
      typeof value.actorId === "string" &&
      bounded(value.actorId, 200) &&
      typeof value.clientId === "string" &&
      bounded(value.clientId, 200) &&
      (value.declaredProvider === undefined ||
        (typeof value.declaredProvider === "string" &&
          bounded(value.declaredProvider, 120))) &&
      (value.declaredModel === undefined ||
        (typeof value.declaredModel === "string" &&
          bounded(value.declaredModel, 120)))
    );
  }

  if (value.kind === "external_adapter") {
    return (
      keysValid(value, ["kind", "actorId", "adapterId"]) &&
      typeof value.actorId === "string" &&
      bounded(value.actorId, 200) &&
      typeof value.adapterId === "string" &&
      bounded(value.adapterId, 200)
    );
  }

  return false;
}

function contextValid(value: unknown): value is CommandContext {
  if (
    !dataObject(value) ||
    !keysValid(value, [
      "ownerId",
      "actor",
      "correlationId",
      "idempotencyKey",
      "reason",
      "confirmed",
      "approvalId",
    ])
  ) {
    return false;
  }

  return (
    typeof value.ownerId === "string" &&
    bounded(value.ownerId, 200) &&
    actorValid(value.actor) &&
    typeof value.correlationId === "string" &&
    bounded(value.correlationId, 200) &&
    typeof value.idempotencyKey === "string" &&
    bounded(value.idempotencyKey, 200) &&
    typeof value.reason === "string" &&
    bounded(value.reason, 500) &&
    typeof value.confirmed === "boolean" &&
    (value.approvalId === null ||
      (typeof value.approvalId === "string" &&
        bounded(value.approvalId, 200)))
  );
}

function targetValid(value: unknown): value is CommandTarget {
  return (
    dataObject(value) &&
    keysValid(value, ["resourceType", "resourceId"]) &&
    typeof value.resourceType === "string" &&
    resourceTypePattern.test(value.resourceType) &&
    value.resourceType.length <= 120 &&
    typeof value.resourceId === "string" &&
    bounded(value.resourceId, 500)
  );
}

function canonicalValueValid(value: unknown, maximumBytes: number): boolean {
  try {
    const serialized = canonicalJson(value);
    return new TextEncoder().encode(serialized).byteLength <= maximumBytes;
  } catch {
    return false;
  }
}

function expectedValid(
  value: unknown,
): value is Readonly<Record<string, JsonValue>> {
  return (
    dataObject(value) &&
    Object.keys(value).length <= 32 &&
    Object.keys(value).every((key) => bounded(key, 120)) &&
    canonicalValueValid(value, 32_000)
  );
}

function manifestFrom(
  definition: ReturnType<CommandRegistry["resolve"]>,
): CommandManifest {
  return {
    commandId: definition.commandId,
    commandVersion: definition.commandVersion,
    capability: definition.capability,
    resourceType: definition.resourceType,
    riskFloor: definition.riskFloor,
    confirmation: definition.confirmation,
    conflictStrategy: definition.conflictStrategy,
    idempotencyStrategy: definition.idempotencyStrategy,
    undoStrategy: definition.undoStrategy,
    auditStrategy: definition.auditStrategy,
    execution: definition.execution,
  };
}

function actorSignature(context: CommandContext): JsonValue {
  switch (context.actor.kind) {
    case "owner_ui":
    case "system":
      return {
        kind: context.actor.kind,
        actorId: context.actor.actorId,
      };
    case "mcp_client":
      return {
        kind: context.actor.kind,
        actorId: context.actor.actorId,
        clientId: context.actor.clientId,
      };
    case "external_adapter":
      return {
        kind: context.actor.kind,
        actorId: context.actor.actorId,
        adapterId: context.actor.adapterId,
      };
  }
}

export class CommandGateway {
  constructor(
    private readonly registry: CommandRegistry,
    private readonly policy: CommandPolicy,
  ) {}

  async prepare(input: {
    commandId: string;
    commandVersion: number;
    target: CommandTarget;
    payload: JsonValue;
    expected: Readonly<Record<string, JsonValue>>;
    context: CommandContext;
  }): Promise<PreparedCommand> {
    if (
      !dataObject(input) ||
      !keysValid(input, [
        "commandId",
        "commandVersion",
        "target",
        "payload",
        "expected",
        "context",
      ]) ||
      typeof input.commandId !== "string" ||
      !commandIdPattern.test(input.commandId) ||
      input.commandId.length > 160 ||
      !Number.isInteger(input.commandVersion) ||
      input.commandVersion < 1
    ) {
      throw new Error("COMMAND_ENVELOPE_INVALID");
    }
    if (!contextValid(input.context)) {
      throw new Error("COMMAND_CONTEXT_INVALID");
    }
    if (!targetValid(input.target)) {
      throw new Error("COMMAND_TARGET_INVALID");
    }
    if (!canonicalValueValid(input.payload, 64_000)) {
      throw new Error("COMMAND_PAYLOAD_INVALID");
    }
    if (!expectedValid(input.expected)) {
      throw new Error("COMMAND_EXPECTED_INVALID");
    }

    const definition = this.registry.resolve(
      input.commandId,
      input.commandVersion,
    );
    const payload = definition.schema.parse(input.payload);
    const target = definition.bindResource(payload);
    if (!targetValid(target) || target.resourceType !== definition.resourceType) {
      throw new Error("COMMAND_RESOURCE_INVALID");
    }
    if (
      input.target.resourceType !== target.resourceType ||
      input.target.resourceId !== target.resourceId
    ) {
      throw new Error("COMMAND_TARGET_MISMATCH");
    }

    const manifest = manifestFrom(definition);
    const [payloadHash, expectedHash, requestHash] = await Promise.all([
      canonicalSha256(payload),
      canonicalSha256(input.expected),
      canonicalSha256({
        commandId: definition.commandId,
        commandVersion: definition.commandVersion,
        capability: definition.capability,
        ownerId: input.context.ownerId,
        actor: actorSignature(input.context),
        target,
        payload,
        expected: input.expected,
        reason: input.context.reason,
      }),
    ]);

    return {
      commandId: definition.commandId,
      commandVersion: definition.commandVersion,
      capability: definition.capability,
      target,
      payload,
      expected: input.expected,
      context: input.context,
      manifest,
      decision: this.policy.evaluate(manifest, input.context, target),
      payloadHash,
      expectedHash,
      requestHash,
    };
  }
}
