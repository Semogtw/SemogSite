import { describe, expect, it } from "vitest";
import {
  CommandRegistry,
  type CommandDefinition,
  type JsonValue,
} from "./command-registry";

function definition(
  bindResource: CommandDefinition<JsonValue, JsonValue>["bindResource"],
): CommandDefinition<JsonValue, JsonValue> {
  return {
    commandId: "attention.transition",
    commandVersion: 1,
    schema: { parse: (value) => value as JsonValue },
    capability: "attention.write",
    resourceType: "attention_item",
    bindResource,
    riskFloor: "medium",
    confirmation: "confirm_in_client",
    conflictStrategy: "expected_timestamp",
    idempotencyStrategy: "required_receipt",
    undoStrategy: "compensating_command",
    auditStrategy: "state_and_receipt",
    execution: "enabled",
  };
}

describe("CommandRegistry resource binding", () => {
  it("accepts only a plain exact target shape", () => {
    const registry = new CommandRegistry([
      definition(() => ({
        resourceType: "attention_item",
        resourceId: "attention-1",
      })),
    ]);

    expect(registry.bindResource("attention.transition", 1, {})).toEqual({
      resourceType: "attention_item",
      resourceId: "attention-1",
    });
  });

  it.each([
    [
      "extra field",
      () => ({
        resourceType: "attention_item",
        resourceId: "attention-1",
        hidden: true,
      }),
    ],
    [
      "special prototype",
      () =>
        Object.assign(Object.create({ inherited: true }), {
          resourceType: "attention_item",
          resourceId: "attention-1",
        }),
    ],
    [
      "accessor",
      () => {
        const target = { resourceType: "attention_item" } as Record<
          string,
          unknown
        >;
        Object.defineProperty(target, "resourceId", {
          enumerable: true,
          get: () => "attention-1",
        });
        return target;
      },
    ],
  ])("rejects %s bindings", (_name, bindResource) => {
    const registry = new CommandRegistry([
      definition(bindResource as CommandDefinition<JsonValue, JsonValue>["bindResource"]),
    ]);

    expect(() =>
      registry.bindResource("attention.transition", 1, {}),
    ).toThrow("COMMAND_RESOURCE_INVALID");
  });
});
