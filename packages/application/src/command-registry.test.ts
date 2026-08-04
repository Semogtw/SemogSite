import { describe, expect, it } from "vitest";
import {
  CommandRegistry,
  type CommandDefinition,
  type JsonValue,
} from "./command-registry";

const definition: CommandDefinition<
  { attentionId: string; action: string },
  { status: string }
> = {
  commandId: "attention.transition",
  commandVersion: 1,
  schema: {
    parse(value) {
      if (
        typeof value !== "object" ||
        value === null ||
        typeof (value as { attentionId?: unknown }).attentionId !== "string" ||
        typeof (value as { action?: unknown }).action !== "string"
      ) {
        throw new Error("ATTENTION_TRANSITION_INVALID");
      }
      return value as { attentionId: string; action: string };
    },
  },
  capability: "attention.write",
  resourceType: "attention",
  bindResource: (payload) => ({
    resourceType: "attention",
    resourceId: payload.attentionId,
  }),
  riskFloor: "medium",
  confirmation: "confirm_in_client",
  conflictStrategy: "expected_timestamp",
  idempotencyStrategy: "required_receipt",
  undoStrategy: "compensating_command",
  auditStrategy: "state_and_receipt",
  execution: "enabled",
};

describe("CommandRegistry", () => {
  it("registers, resolves and describes a typed command", () => {
    const registry = new CommandRegistry();
    registry.register(definition);

    const resolved = registry.resolve("attention.transition", 1);
    const payload = resolved.schema.parse({
      attentionId: "attention-1",
      action: "acknowledge",
    });

    expect(resolved.bindResource(payload as never)).toEqual({
      resourceType: "attention",
      resourceId: "attention-1",
    });
    expect(registry.listManifests()).toEqual([
      expect.objectContaining({
        commandId: "attention.transition",
        commandVersion: 1,
        capability: "attention.write",
        riskFloor: "medium",
        execution: "enabled",
      }),
    ]);
  });

  it("rejects duplicate IDs and versions", () => {
    const registry = new CommandRegistry([definition]);
    expect(() => registry.register(definition)).toThrow(
      "COMMAND_DEFINITION_DUPLICATE",
    );
  });

  it.each([
    [{ ...definition, commandId: "Attention Transition" }, "COMMAND_ID_INVALID"],
    [{ ...definition, commandId: "devos.update_anything" }, "COMMAND_ID_FORBIDDEN_GENERIC"],
    [{ ...definition, commandVersion: 0 }, "COMMAND_VERSION_INVALID"],
    [{ ...definition, capability: "*" }, "COMMAND_CAPABILITY_INVALID"],
    [{ ...definition, resourceType: "" }, "COMMAND_RESOURCE_TYPE_INVALID"],
  ] as const)("rejects malformed definitions", (value, code) => {
    expect(() => new CommandRegistry([value as CommandDefinition<JsonValue, JsonValue>])).toThrow(
      code,
    );
  });

  it("fails closed for unknown commands and invalid resource bindings", () => {
    const registry = new CommandRegistry([definition]);
    expect(() => registry.resolve("unknown.command", 1)).toThrow(
      "COMMAND_DEFINITION_NOT_FOUND",
    );

    const invalidResource: CommandDefinition<JsonValue, JsonValue> = {
      ...(definition as CommandDefinition<JsonValue, JsonValue>),
      commandId: "attention.invalid_resource",
      bindResource: () => ({ resourceType: "attention", resourceId: "" }),
    };
    registry.register(invalidResource);
    expect(() =>
      registry.bindResource(
        "attention.invalid_resource",
        1,
        { attentionId: "attention-1", action: "acknowledge" },
      ),
    ).toThrow("COMMAND_RESOURCE_INVALID");
  });
});
