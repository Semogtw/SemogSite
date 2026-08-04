import { describe, expect, it } from "vitest";
import {
  CommandRegistry,
  type CommandDefinition,
  type JsonValue,
} from "./command-registry";

const definition: CommandDefinition<JsonValue, JsonValue> = {
  commandId: "attention.transition",
  commandVersion: 1,
  schema: { parse: (value) => value as JsonValue },
  capability: "attention.write",
  resourceType: "attention_item",
  bindResource: () => ({
    resourceType: "attention_item",
    resourceId: "attention-1",
  }),
  riskFloor: "medium",
  confirmation: "confirm_in_client",
  conflictStrategy: "expected_timestamp",
  idempotencyStrategy: "required_receipt",
  undoStrategy: "compensating_command",
  auditStrategy: "state_and_receipt",
  execution: "enabled",
};

describe("CommandRegistry persistence bounds", () => {
  it.each([
    [
      { ...definition, commandId: `attention.${"x".repeat(151)}` },
      "COMMAND_ID_INVALID",
    ],
    [
      { ...definition, capability: `attention.${"x".repeat(151)}` },
      "COMMAND_CAPABILITY_INVALID",
    ],
    [
      { ...definition, resourceType: `a${"x".repeat(120)}` },
      "COMMAND_RESOURCE_TYPE_INVALID",
    ],
    [
      { ...definition, commandVersion: 2_147_483_648 },
      "COMMAND_VERSION_INVALID",
    ],
  ] as const)("rejects definitions outside durable bounds", (value, code) => {
    expect(
      () => new CommandRegistry([value as CommandDefinition<JsonValue, JsonValue>]),
    ).toThrow(code);
  });
});
