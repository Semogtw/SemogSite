import { describe, expect, it, vi } from "vitest";
import type { PreparedCommand } from "./command-gateway";
import {
  createReceiptClaim,
  createReceiptFailure,
  createReceiptSuccess,
} from "./command-receipt";

function prepared(): PreparedCommand {
  return {
    commandId: "attention.transition",
    commandVersion: 1,
    capability: "attention.write",
    target: { resourceType: "attention_item", resourceId: "attention_1" },
    payload: { attentionId: "attention_1" },
    expected: { version: 1 },
    context: {
      ownerId: "owner_1",
      actor: {
        kind: "mcp_client",
        actorId: "agent_1",
        clientId: "client_1",
      },
      correlationId: "correlation_1",
      idempotencyKey: "idempotency_1",
      reason: "Apply a supervised transition.",
      confirmed: true,
      approvalId: null,
    },
    manifest: {
      commandId: "attention.transition",
      commandVersion: 1,
      capability: "attention.write",
      resourceType: "attention_item",
      riskFloor: "low",
      confirmation: "allow",
      conflictStrategy: "expected_timestamp",
      idempotencyStrategy: "required_receipt",
      undoStrategy: "compensating_command",
      auditStrategy: "state_and_receipt",
      execution: "enabled",
    },
    decision: {
      outcome: "allow",
      risk: "low",
      reasonCode: "LOW_RISK_ALLOWED",
      approvalId: null,
    },
    payloadHash: "a".repeat(64),
    expectedHash: "b".repeat(64),
    requestHash: "c".repeat(64),
  };
}

const timing = {
  receiptId: "receipt_1",
  claimedAt: "2026-08-05T12:00:00.000Z",
  leaseExpiresAt: "2026-08-05T12:05:00.000Z",
};

describe("command receipt public boundary", () => {
  it("rejects accessor-backed decisions without invoking them", () => {
    const getter = vi.fn(() => "allow");
    const candidate = prepared();
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
    candidate.decision = decision as PreparedCommand["decision"];

    expect(() => createReceiptClaim(candidate, timing)).toThrow(
      "COMMAND_RECEIPT_INVALID",
    );
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects accessor-backed client identity without invoking it", () => {
    const getter = vi.fn(() => "client_1");
    const candidate = prepared();
    const actor: Record<string, unknown> = {
      kind: "mcp_client",
      actorId: "agent_1",
    };
    Object.defineProperty(actor, "clientId", {
      configurable: true,
      enumerable: true,
      get: getter,
    });
    candidate.context.actor = actor as PreparedCommand["context"]["actor"];

    expect(() => createReceiptClaim(candidate, timing)).toThrow(
      "COMMAND_RECEIPT_INVALID",
    );
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects accessor-backed failure inputs without invoking them", () => {
    const getter = vi.fn(() => "receipt_1");
    const input: Record<string, unknown> = {
      requestHash: "c".repeat(64),
      stableErrorCode: "ATTENTION_CONFLICT",
      retryable: false,
      completedAt: "2026-08-05T12:01:00.000Z",
    };
    Object.defineProperty(input, "receiptId", {
      configurable: true,
      enumerable: true,
      get: getter,
    });

    expect(() => createReceiptFailure(input as never)).toThrow(
      "COMMAND_RECEIPT_INVALID",
    );
    expect(getter).not.toHaveBeenCalled();
  });

  it("rejects accessor-backed success summaries without invoking them", async () => {
    const getter = vi.fn(() => "acknowledged");
    const summary: Record<string, unknown> = {};
    Object.defineProperty(summary, "status", {
      configurable: true,
      enumerable: true,
      get: getter,
    });

    await expect(
      createReceiptSuccess({
        receiptId: "receipt_1",
        requestHash: "c".repeat(64),
        summary: summary as never,
        completedAt: "2026-08-05T12:01:00.000Z",
      }),
    ).rejects.toThrow("COMMAND_RECEIPT_INVALID");
    expect(getter).not.toHaveBeenCalled();
  });
});
