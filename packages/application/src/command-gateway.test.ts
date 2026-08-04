import { describe, expect, it } from "vitest";
import { CommandGateway } from "./command-gateway";
import {
  CommandRegistry,
  type CommandDefinition,
} from "./command-registry";
import type { CommandEnvelope } from "./core";
import { OwnerBrowserPolicy } from "./owner-browser-policy";

const attentionDefinition: CommandDefinition<
  { action: string; attentionId: string },
  { status: string }
> = {
  commandId: "attention.transition",
  commandVersion: 1,
  schema: {
    parse(value) {
      if (
        typeof value !== "object" ||
        value === null ||
        Object.keys(value).sort().join(",") !== "action,attentionId" ||
        typeof (value as { action?: unknown }).action !== "string" ||
        typeof (value as { attentionId?: unknown }).attentionId !== "string"
      ) {
        throw new Error("ATTENTION_TRANSITION_INVALID");
      }
      const parsed = value as { action: string; attentionId: string };
      return { action: parsed.action.trim(), attentionId: parsed.attentionId.trim() };
    },
  },
  capability: "attention.write",
  resourceType: "attention",
  bindResource(payload) {
    return { resourceType: "attention", resourceId: payload.attentionId };
  },
  riskFloor: "medium",
  confirmation: "confirm_in_client",
  conflictStrategy: "expected_timestamp",
  idempotencyStrategy: "required_receipt",
  undoStrategy: "compensating_command",
  auditStrategy: "state_and_receipt",
  execution: "enabled",
};

function envelope(
  overrides: Partial<CommandEnvelope<{ action: string; attentionId: string }>> = {},
): CommandEnvelope<{ action: string; attentionId: string }> {
  return {
    commandId: "attention.transition",
    commandVersion: 1,
    target: { resourceType: "attention", resourceId: "attention-1" },
    payload: { attentionId: "attention-1", action: "acknowledge" },
    expected: { updatedAt: "2026-08-04T00:00:00.000Z" },
    context: {
      ownerId: "owner-1",
      actor: { kind: "owner_ui", actorId: "owner-1" },
      correlationId: "correlation-1",
      idempotencyKey: "8c8c16cb-7367-4f96-86cf-afbbfbf84122",
      reason: "Acknowledge attention",
      confirmed: false,
      approvalId: null,
    },
    ...overrides,
  };
}

describe("CommandGateway.prepare", () => {
  const gateway = new CommandGateway(
    new CommandRegistry([attentionDefinition]),
    new OwnerBrowserPolicy(),
  );

  it("validates payload, binds the resource and returns a policy decision", () => {
    const prepared = gateway.prepare(envelope());

    expect(prepared).toMatchObject({
      commandId: "attention.transition",
      commandVersion: 1,
      capability: "attention.write",
      target: { resourceType: "attention", resourceId: "attention-1" },
      payload: { attentionId: "attention-1", action: "acknowledge" },
      decision: {
        outcome: "confirm_in_client",
        risk: "medium",
      },
    });
    expect(prepared.payloadHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(prepared.expectedHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(prepared.requestHash).toMatch(/^[a-f0-9]{64}$/u);
  });

  it("keeps the semantic request hash stable when only confirmation changes", () => {
    const first = gateway.prepare(envelope());
    const second = gateway.prepare(
      envelope({
        payload: { action: "acknowledge", attentionId: "attention-1" },
        context: { ...envelope().context, confirmed: true },
      }),
    );

    expect(first.requestHash).toBe(second.requestHash);
    expect(first.payloadHash).toBe(second.payloadHash);
    expect(second.decision.outcome).toBe("allow");
  });

  it("rejects a client target that differs from the server binding", () => {
    expect(() =>
      gateway.prepare(
        envelope({
          target: { resourceType: "attention", resourceId: "attention-other" },
        }),
      ),
    ).toThrow("COMMAND_TARGET_MISMATCH");
  });

  it.each([
    ["owner", { ownerId: "" }],
    ["correlation", { correlationId: " correlation " }],
    ["idempotency", { idempotencyKey: "" }],
    ["reason", { reason: "" }],
  ] as const)("rejects invalid %s context", (_name, contextOverride) => {
    expect(() =>
      gateway.prepare(
        envelope({
          context: { ...envelope().context, ...contextOverride },
        }),
      ),
    ).toThrow("COMMAND_CONTEXT_INVALID");
  });

  it("fails closed for unknown commands before hashing", () => {
    expect(() =>
      gateway.prepare(envelope({ commandId: "attention.unknown" })),
    ).toThrow("COMMAND_DEFINITION_NOT_FOUND");
  });
});
