import { describe, expect, it } from "vitest";
import * as application from "./index";
import {
  confirmationOutcomes,
  riskTiers,
  type CapabilityManifest,
  type CommandContext,
  type CommandEnvelope,
  type CommandResult,
} from "./index";

describe("@semogtw/application public contracts", () => {
  it("keeps risk and policy outcomes closed and ordered", () => {
    expect(riskTiers).toEqual(["read", "low", "medium", "high", "critical"]);
    expect(confirmationOutcomes).toEqual([
      "allow",
      "confirm_in_client",
      "prepare_approval",
      "approve_in_devos",
      "deny",
    ]);
  });

  it("exports owner authorization request planners", () => {
    expect(application).toMatchObject({
      validateAgentGrantRequest: expect.any(Function),
      planAgentGrantCreation: expect.any(Function),
      planAgentGrantRevocation: expect.any(Function),
      planAgentClientRevocation: expect.any(Function),
      planAgentTrustSessionCreation: expect.any(Function),
      planAgentTrustSessionRevocation: expect.any(Function),
      createAgentAuthorizationMutationExecutor: expect.any(Function),
    });
  });

  it("models a transport-neutral command envelope", () => {
    const context: CommandContext = {
      ownerId: "owner-1",
      actor: { kind: "owner_ui", actorId: "owner-1" },
      correlationId: "correlation-1",
      idempotencyKey: "8c8c16cb-7367-4f96-86cf-afbbfbf84122",
      reason: "Acknowledge attention",
      confirmed: true,
      approvalId: null,
    };
    const envelope: CommandEnvelope<{ attentionId: string }> = {
      commandId: "attention.transition",
      commandVersion: 1,
      target: {
        resourceType: "attention",
        resourceId: "attention-1",
      },
      payload: { attentionId: "attention-1" },
      expected: { updatedAt: "2026-08-04T00:00:00.000Z" },
      context,
    };

    expect(envelope.commandId).toBe("attention.transition");
    expect(envelope.context.actor.kind).toBe("owner_ui");
  });

  it("requires every capability manifest to declare safety and parity behavior", () => {
    const manifest: CapabilityManifest = {
      commandId: "attention.transition",
      commandVersion: 1,
      capability: "attention.write",
      resourceType: "attention",
      riskFloor: "medium",
      confirmation: "confirm_in_client",
      conflictStrategy: "expected_timestamp",
      undoStrategy: "compensating_command",
      auditStrategy: "state_and_receipt",
      adapters: {
        ownerUi: "write",
        mcp: "not_implemented",
      },
    };
    const result: CommandResult<{ status: string }> = {
      ok: true,
      value: { status: "acknowledged" },
      replayed: false,
      receiptId: "receipt-1",
    };

    expect(manifest.riskFloor).toBe("medium");
    expect(result.ok).toBe(true);
  });
});
