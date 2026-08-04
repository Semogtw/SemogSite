import { describe, expect, it } from "vitest";
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
    target: { resourceType: "attention", resourceId: "attention-1" },
    payload: { action: "acknowledge", attentionId: "attention-1" },
    expected: { updatedAt: "2026-08-04T00:00:00.000Z" },
    context: {
      ownerId: "owner-1",
      actor: { kind: "owner_ui", actorId: "owner-1" },
      correlationId: "correlation-1",
      idempotencyKey: "idempotency-1",
      reason: "Acknowledge attention",
      confirmed: true,
      approvalId: null,
    },
    manifest: {
      commandId: "attention.transition",
      commandVersion: 1,
      capability: "attention.write",
      resourceType: "attention",
      riskFloor: "medium",
      confirmation: "confirm_in_client",
      conflictStrategy: "expected_timestamp",
      idempotencyStrategy: "required_receipt",
      undoStrategy: "compensating_command",
      auditStrategy: "state_and_receipt",
      execution: "enabled",
    },
    decision: {
      outcome: "allow",
      risk: "medium",
      reasonCode: "CLIENT_CONFIRMATION_ACCEPTED",
      approvalId: null,
    },
    payloadHash: "a".repeat(64),
    expectedHash: "b".repeat(64),
    requestHash: "c".repeat(64),
  };
}

describe("command receipt contracts", () => {
  it("creates a claim from prepared metadata without raw payload fields", () => {
    const claim = createReceiptClaim(prepared(), {
      receiptId: "receipt-1",
      claimedAt: "2026-08-04T05:00:00.000Z",
      leaseExpiresAt: "2026-08-04T05:05:00.000Z",
    });

    expect(claim).toEqual({
      id: "receipt-1",
      ownerId: "owner-1",
      commandId: "attention.transition",
      commandVersion: 1,
      capability: "attention.write",
      resourceType: "attention",
      resourceId: "attention-1",
      actorKind: "owner_ui",
      actorId: "owner-1",
      clientId: "",
      requestHash: "c".repeat(64),
      claimedAt: "2026-08-04T05:00:00.000Z",
      leaseExpiresAt: "2026-08-04T05:05:00.000Z",
      correlationId: "correlation-1",
      idempotencyKey: "idempotency-1",
    });
    expect(JSON.stringify(claim)).not.toMatch(/payload|token|cookie|secret/iu);
  });

  it("creates a deterministic bounded success finalization", async () => {
    const success = await createReceiptSuccess({
      receiptId: "receipt-1",
      requestHash: "c".repeat(64),
      summary: { status: "acknowledged", attentionId: "attention-1" },
      completedAt: "2026-08-04T05:01:00.000Z",
    });

    expect(success.kind).toBe("success");
    expect(success.resultHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(success.resultSummaryJson).toBe(
      '{"attentionId":"attention-1","status":"acknowledged"}',
    );
    expect(success.stableErrorCode).toBeNull();
  });

  it("creates a stable failure without exception text or result data", () => {
    expect(
      createReceiptFailure({
        receiptId: "receipt-1",
        requestHash: "c".repeat(64),
        stableErrorCode: "ATTENTION_CONFLICT",
        retryable: false,
        completedAt: "2026-08-04T05:01:00.000Z",
      }),
    ).toEqual({
      kind: "failure",
      receiptId: "receipt-1",
      requestHash: "c".repeat(64),
      resultHash: null,
      resultSummaryJson: null,
      stableErrorCode: "ATTENTION_CONFLICT",
      retryable: false,
      completedAt: "2026-08-04T05:01:00.000Z",
    });
  });

  it("rejects invalid synchronous receipt material", () => {
    expect(() =>
      createReceiptClaim(prepared(), {
        receiptId: "receipt-1",
        claimedAt: "2026-08-04T05:05:00.000Z",
        leaseExpiresAt: "2026-08-04T05:00:00.000Z",
      }),
    ).toThrow("COMMAND_RECEIPT_INVALID");
    expect(() =>
      createReceiptFailure({
        receiptId: "receipt-1",
        requestHash: "c".repeat(64),
        stableErrorCode: "raw exception: database path /private/data",
        retryable: false,
        completedAt: "2026-08-04T05:01:00.000Z",
      }),
    ).toThrow("COMMAND_RECEIPT_INVALID");
  });

  it("rejects invalid asynchronous success material", async () => {
    await expect(
      createReceiptSuccess({
        receiptId: "receipt-1",
        requestHash: "not-a-hash",
        summary: { ok: true },
        completedAt: "2026-08-04T05:01:00.000Z",
      }),
    ).rejects.toThrow("COMMAND_RECEIPT_INVALID");
    await expect(
      createReceiptSuccess({
        receiptId: "receipt-1",
        requestHash: "c".repeat(64),
        summary: { value: "x".repeat(5000) },
        completedAt: "2026-08-04T05:01:00.000Z",
      }),
    ).rejects.toThrow("COMMAND_RECEIPT_INVALID");
  });
});
