import { describe, expect, it } from "vitest";
import { CommandGateway, type CommandPolicy } from "./command-gateway";
import { CommandRegistry, type CommandDefinition } from "./command-registry";
import type { CommandTarget, JsonValue, PolicyDecision } from "./core";

const definition: CommandDefinition<
  { attentionId: string },
  { status: string }
> = {
  commandId: "attention.resolve",
  commandVersion: 1,
  schema: {
    parse(value) {
      if (
        typeof value !== "object" ||
        value === null ||
        typeof (value as { attentionId?: unknown }).attentionId !== "string"
      ) {
        throw new Error("INVALID");
      }
      return { attentionId: (value as { attentionId: string }).attentionId };
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
  riskFloor: "medium",
  confirmation: "confirm_in_client",
  conflictStrategy: "expected_timestamp",
  idempotencyStrategy: "required_receipt",
  undoStrategy: "compensating_command",
  auditStrategy: "state_and_receipt",
  execution: "enabled",
};

function allow(): PolicyDecision {
  return {
    outcome: "allow",
    risk: "medium",
    reasonCode: "TEST_ALLOWED",
    approvalId: null,
  };
}

describe("CommandGateway policy target", () => {
  it("passes the server-bound canonical target to policy evaluation", async () => {
    let observedTarget: CommandTarget | null = null;
    const policy: CommandPolicy = {
      evaluate(_manifest, _context, target) {
        observedTarget = target;
        return allow();
      },
    };
    const gateway = new CommandGateway(
      new CommandRegistry([definition]),
      policy,
    );

    await gateway.prepare({
      commandId: "attention.resolve",
      commandVersion: 1,
      target: {
        resourceType: "attention_item",
        resourceId: "attention_1",
      },
      payload: { attentionId: "attention_1" } satisfies JsonValue,
      expected: { updatedAt: "2026-08-04T20:00:00.000Z" },
      context: {
        ownerId: "owner_1",
        actor: {
          kind: "mcp_client",
          actorId: "agent_1",
          clientId: "client_1",
        },
        correlationId: "correlation_1",
        idempotencyKey: "idempotency_1",
        reason: "Resolver item autorizado.",
        confirmed: false,
        approvalId: null,
      },
    });

    expect(observedTarget).toEqual({
      resourceType: "attention_item",
      resourceId: "attention_1",
    });
  });
});
