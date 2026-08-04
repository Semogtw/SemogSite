import { describe, expect, it } from "vitest";
import { CommandRegistry } from "../command-registry";
import {
  transitionAttentionCommand,
  type TransitionAttentionPayload,
} from "./transition-attention-command";

describe("attention.transition command definition", () => {
  it("registers stable safety and parity metadata", () => {
    const registry = new CommandRegistry([transitionAttentionCommand]);

    expect(registry.listManifests()).toEqual([
      {
        commandId: "attention.transition",
        commandVersion: 1,
        capability: "attention.write",
        resourceType: "attention_item",
        riskFloor: "medium",
        confirmation: "confirm_in_client",
        conflictStrategy: "expected_timestamp",
        idempotencyStrategy: "required_receipt",
        undoStrategy: "compensating_command",
        auditStrategy: "state_and_receipt",
        execution: "enabled",
      },
    ]);
  });

  it("normalizes a strict bounded payload and binds the canonical resource", () => {
    const parsed = transitionAttentionCommand.schema.parse({
      attentionId: "  attention-1  ",
      targetStatus: "resolved",
      reason: "  Resolvido após verificar o resultado.  ",
    });

    expect(parsed).toEqual<TransitionAttentionPayload>({
      attentionId: "attention-1",
      targetStatus: "resolved",
      reason: "Resolvido após verificar o resultado.",
    });
    expect(transitionAttentionCommand.bindResource(parsed)).toEqual({
      resourceType: "attention_item",
      resourceId: "attention-1",
    });
  });

  it.each([
    null,
    {},
    { attentionId: "", targetStatus: "resolved", reason: "ok" },
    { attentionId: "attention-1", targetStatus: "open", reason: "ok" },
    { attentionId: "attention-1", targetStatus: "resolved", reason: "" },
    {
      attentionId: "attention-1",
      targetStatus: "resolved",
      reason: "x".repeat(501),
    },
    {
      attentionId: "attention-1",
      targetStatus: "resolved",
      reason: "ok",
      arbitrary: true,
    },
  ])("rejects invalid or non-strict payload %#", (payload) => {
    expect(() => transitionAttentionCommand.schema.parse(payload)).toThrow(
      "ATTENTION_TRANSITION_INPUT_INVALID",
    );
  });
});
