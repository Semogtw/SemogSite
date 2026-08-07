import { describe, expect, it, vi } from "vitest";
import {
  CommandRegistry,
  type CommandDefinition,
} from "./command-registry";

function definition(): CommandDefinition<
  { attentionId: string },
  { status: string }
> {
  return {
    commandId: "attention.transition",
    commandVersion: 1,
    schema: {
      parse(value) {
        return value as { attentionId: string };
      },
    },
    capability: "attention.write",
    resourceType: "attention_item",
    bindResource(payload) {
      return {
        resourceType: "attention_item",
        resourceId: payload.attentionId,
      };
    },
    riskFloor: "low",
    confirmation: "allow",
    conflictStrategy: "expected_timestamp",
    idempotencyStrategy: "required_receipt",
    undoStrategy: "compensating_command",
    auditStrategy: "state_and_receipt",
    execution: "enabled",
  };
}

function accessorArray<T>(getter: () => T): T[] {
  const value: T[] = [];
  Object.defineProperty(value, "0", {
    configurable: true,
    enumerable: true,
    get: getter,
  });
  value.length = 1;
  return value;
}

describe("command registry public boundary", () => {
  it("rejects accessor definitions without invoking them", () => {
    const getter = vi.fn(() => definition());

    expect(() => new CommandRegistry(accessorArray(getter))).toThrow(
      "COMMAND_DEFINITION_INVALID",
    );
    expect(getter).not.toHaveBeenCalled();
  });

  it("reads constructor definitions without invoking caller iterators", () => {
    const definitions = [definition()];
    const iteratorGetter = vi.fn(() => {
      throw new Error("caller iterator must not run");
    });
    Object.defineProperty(definitions, Symbol.iterator, {
      configurable: true,
      get: iteratorGetter,
    });

    expect(
      new CommandRegistry(definitions).listManifests(),
    ).toEqual([
      expect.objectContaining({
        commandId: "attention.transition",
        commandVersion: 1,
      }),
    ]);
    expect(iteratorGetter).not.toHaveBeenCalled();
  });

  it("stores a frozen snapshot instead of caller-owned definition objects", () => {
    const source = definition();
    const registry = new CommandRegistry([source]);

    source.commandId = "attention.mutated";
    source.capability = "roadmap.write";
    source.schema.parse = () => ({ attentionId: "mutated" });

    const resolved = registry.resolve("attention.transition", 1);
    expect(resolved.commandId).toBe("attention.transition");
    expect(resolved.capability).toBe("attention.write");
    expect(resolved.schema.parse({ attentionId: "attention_1" })).toEqual({
      attentionId: "attention_1",
    });
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.schema)).toBe(true);
  });

  it("does not expose mutable registry state through resolve", () => {
    const registry = new CommandRegistry([definition()]);
    const resolved = registry.resolve("attention.transition", 1);

    expect(() => {
      (resolved as { commandId: string }).commandId = "attention.mutated";
    }).toThrow();
    expect(registry.resolve("attention.transition", 1).commandId).toBe(
      "attention.transition",
    );
  });
});
