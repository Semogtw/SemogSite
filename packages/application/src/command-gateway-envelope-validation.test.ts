import { describe, expect, it } from "vitest";
import { CommandGateway } from "./command-gateway";
import { CommandRegistry } from "./command-registry";
import type { CommandEnvelope } from "./core";
import { OwnerBrowserPolicy } from "./owner-browser-policy";

const gateway = new CommandGateway(
  new CommandRegistry(),
  new OwnerBrowserPolicy(),
);

function unknownEnvelope(): CommandEnvelope {
  return {
    commandId: "attention.unknown",
    commandVersion: 1,
    target: { resourceType: "attention_item", resourceId: "attention-1" },
    payload: { attentionId: "attention-1" },
    expected: { updatedAt: "2026-08-04T05:00:00.000Z" },
    context: {
      ownerId: "owner-1",
      actor: { kind: "owner_ui", actorId: "owner-1" },
      correlationId: "correlation-1",
      idempotencyKey: "idempotency-1",
      reason: "Validate the envelope.",
      confirmed: true,
      approvalId: null,
    },
  };
}

describe("CommandGateway envelope validation order", () => {
  it("rejects invalid context before resolving an unknown command", async () => {
    await expect(
      gateway.prepare({
        ...unknownEnvelope(),
        context: {
          ...unknownEnvelope().context,
          actor: null,
        } as unknown as CommandEnvelope["context"],
      }),
    ).rejects.toThrow("COMMAND_CONTEXT_INVALID");
  });

  it("rejects malformed targets before resolving an unknown command", async () => {
    const target = Object.defineProperty(
      { resourceType: "attention_item", resourceId: "attention-1" },
      "hidden",
      { value: true, enumerable: false },
    );
    await expect(
      gateway.prepare({
        ...unknownEnvelope(),
        target: target as unknown as CommandEnvelope["target"],
      }),
    ).rejects.toThrow("COMMAND_TARGET_INVALID");
  });

  it("rejects noncanonical payload and expected state before registry lookup", async () => {
    await expect(
      gateway.prepare({
        ...unknownEnvelope(),
        payload: { observedAt: new Date() } as unknown as CommandEnvelope["payload"],
      }),
    ).rejects.toThrow("COMMAND_PAYLOAD_INVALID");

    const expected = Object.create({ inherited: true }) as Record<
      string,
      string
    >;
    expected.updatedAt = "2026-08-04T05:00:00.000Z";
    await expect(
      gateway.prepare({
        ...unknownEnvelope(),
        expected: expected as CommandEnvelope["expected"],
      }),
    ).rejects.toThrow("COMMAND_EXPECTED_INVALID");
  });

  it("resolves the registry only after a structurally valid envelope", async () => {
    await expect(gateway.prepare(unknownEnvelope())).rejects.toThrow(
      "COMMAND_DEFINITION_NOT_FOUND",
    );
  });
});
