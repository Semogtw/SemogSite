import { describe, expect, it, vi } from "vitest";
import {
  CommandGateway,
  type CommandPolicy,
} from "./command-gateway";
import {
  CommandRegistry,
  type CommandDefinition,
} from "./command-registry";
import type {
  CommandContext,
  JsonValue,
  PolicyDecision,
} from "./core";

const context: CommandContext = {
  ownerId: "owner_1",
  actor: { kind: "owner_ui", actorId: "owner_1" },
  correlationId: "correlation_1",
  idempotencyKey: "idempotency_1",
  reason: "Apply a supervised transition.",
  confirmed: false,
  approvalId: null,
};

function definition(
  parse: (value: unknown) => { attentionId: string },
): CommandDefinition<{ attentionId: string }, { status: string }> {
  return {
    commandId: "attention.transition",
    commandVersion: 1,
    schema: { parse },
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

const allowPolicy: CommandPolicy = {
  evaluate(): PolicyDecision {
    return {
      outcome: "allow",
      risk: "low",
      reasonCode: "LOW_RISK_ALLOWED",
      approvalId: null,
    };
  },
};

function envelope(expected: Record<string, JsonValue> = { version: 1 }) {
  return {
    commandId: "attention.transition",
    commandVersion: 1,
    target: {
      resourceType: "attention_item",
      resourceId: "attention_1",
    },
    payload: { attentionId: "attention_1" },
    expected,
    context,
  };
}

describe("command gateway public boundary", () => {
  it("returns canonical copies instead of caller envelope objects", async () => {
    const expected = { snapshot: { state: "open" } };
    const mutableContext = {
      ...context,
      actor: { ...context.actor },
    };
    const gateway = new CommandGateway(
      new CommandRegistry([
        definition((value) => ({
          attentionId: (value as { attentionId: string }).attentionId,
        })),
      ]),
      allowPolicy,
    );

    const prepared = await gateway.prepare({
      ...envelope(expected),
      context: mutableContext,
    });
    expected.snapshot.state = "closed";
    mutableContext.reason = "Mutated after prepare.";
    mutableContext.actor.actorId = "owner_other";

    expect(prepared.expected).toEqual({ snapshot: { state: "open" } });
    expect(prepared.context.reason).toBe(
      "Apply a supervised transition.",
    );
    expect(prepared.context.actor.actorId).toBe("owner_1");
  });

  it("rejects accessor-backed schema output without invoking it", async () => {
    const getter = vi.fn(() => "attention_1");
    const gateway = new CommandGateway(
      new CommandRegistry([
        definition(() => {
          const parsed: Record<string, unknown> = {};
          Object.defineProperty(parsed, "attentionId", {
            configurable: true,
            enumerable: true,
            get: getter,
          });
          return parsed as { attentionId: string };
        }),
      ]),
      allowPolicy,
    );

    await expect(gateway.prepare(envelope())).rejects.toThrow(
      "COMMAND_PAYLOAD_INVALID",
    );
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects accessor-backed policy decisions without invoking them", async () => {
    const getter = vi.fn(() => "allow");
    const policy: CommandPolicy = {
      evaluate() {
        const decision: Record<string, unknown> = {
          risk: "low",
          reasonCode: "LOW_RISK_ALLOWED",
          approvalId: null,
        };
        Object.defineProperty(decision, "outcome", {
          configurable: true,
          enumerable: true,
          get: getter,
        });
        return decision as PolicyDecision;
      },
    };
    const gateway = new CommandGateway(
      new CommandRegistry([
        definition((value) => value as { attentionId: string }),
      ]),
      policy,
    );

    await expect(gateway.prepare(envelope())).rejects.toThrow(
      "COMMAND_POLICY_DECISION_INVALID",
    );
    expect(getter).not.toHaveBeenCalled();
  });
});
