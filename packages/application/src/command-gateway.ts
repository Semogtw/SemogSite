import { canonicalSha256 } from "./canonical-json";
import type {
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

function bounded(value: string, maximum: number): boolean {
  return (
    value.length >= 1 &&
    value.length <= maximum &&
    value.trim() === value
  );
}

function contextValid(context: CommandContext): boolean {
  if (
    !bounded(context.ownerId, 200) ||
    !bounded(context.actor.actorId, 200) ||
    !bounded(context.correlationId, 200) ||
    !bounded(context.idempotencyKey, 200) ||
    !bounded(context.reason, 500) ||
    typeof context.confirmed !== "boolean" ||
    (context.approvalId !== null && !bounded(context.approvalId, 200))
  ) {
    return false;
  }
  if (
    context.actor.kind === "mcp_client" &&
    (!bounded(context.actor.clientId, 200) ||
      (context.actor.declaredProvider !== undefined &&
        !bounded(context.actor.declaredProvider, 120)) ||
      (context.actor.declaredModel !== undefined &&
        !bounded(context.actor.declaredModel, 120)))
  ) {
    return false;
  }
  if (
    context.actor.kind === "external_adapter" &&
    !bounded(context.actor.adapterId, 200)
  ) {
    return false;
  }
  return true;
}

function targetValid(target: CommandTarget, resourceType: string): boolean {
  return (
    target.resourceType === resourceType &&
    bounded(target.resourceId, 500)
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

  prepare(input: {
    commandId: string;
    commandVersion: number;
    target: CommandTarget;
    payload: JsonValue;
    expected: Readonly<Record<string, JsonValue>>;
    context: CommandContext;
  }): PreparedCommand {
    const definition = this.registry.resolve(
      input.commandId,
      input.commandVersion,
    );
    if (!contextValid(input.context)) {
      throw new Error("COMMAND_CONTEXT_INVALID");
    }

    const payload = definition.schema.parse(input.payload);
    const target = definition.bindResource(payload);
    if (!targetValid(target, definition.resourceType)) {
      throw new Error("COMMAND_RESOURCE_INVALID");
    }
    if (
      input.target.resourceType !== target.resourceType ||
      input.target.resourceId !== target.resourceId
    ) {
      throw new Error("COMMAND_TARGET_MISMATCH");
    }

    const manifest = manifestFrom(definition);
    const payloadHash = canonicalSha256(payload);
    const expectedHash = canonicalSha256(input.expected);
    const requestHash = canonicalSha256({
      commandId: definition.commandId,
      commandVersion: definition.commandVersion,
      capability: definition.capability,
      ownerId: input.context.ownerId,
      actor: actorSignature(input.context),
      target,
      payload,
      expected: input.expected,
      reason: input.context.reason,
    });

    return {
      commandId: definition.commandId,
      commandVersion: definition.commandVersion,
      capability: definition.capability,
      target,
      payload,
      expected: input.expected,
      context: input.context,
      manifest,
      decision: this.policy.evaluate(manifest, input.context),
      payloadHash,
      expectedHash,
      requestHash,
    };
  }
}
