import { describe, expect, it } from "vitest";
import {
  planAttentionLifecycleTransition,
  validateAttentionLifecycleTransition,
  type AttentionLifecycleSnapshot,
} from "./attention-lifecycle-service";

const before: AttentionLifecycleSnapshot = {
  id: "attention-1",
  projectId: null,
  type: "risk",
  status: "monitoring",
  impact: "high",
  title: "Executar gates",
  owner: "owner",
  nextAction: "Rodar os testes no ambiente correto.",
  source: "manual",
  resolvedAt: null,
  createdAt: "2026-08-04T05:00:00.000Z",
  updatedAt: "2026-08-04T05:30:00.000Z",
};

const context = {
  actorId: "owner-1",
  auditId: "audit-1",
  correlationId: "correlation-1",
  now: "2026-08-04T06:00:00.000Z",
};

describe("attention lifecycle planner", () => {
  it("validates confirmation and returns a normalized command", () => {
    expect(
      validateAttentionLifecycleTransition({
        attentionId: "  attention-1  ",
        targetStatus: "resolved",
        reason: "  Gate executado.  ",
        confirmed: true,
      }),
    ).toEqual({
      ok: true,
      value: {
        attentionId: "attention-1",
        targetStatus: "resolved",
        reason: "Gate executado.",
      },
    });

    expect(
      validateAttentionLifecycleTransition({
        attentionId: "attention-1",
        targetStatus: "dismissed",
        reason: "   ",
        confirmed: false,
      }),
    ).toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["CONFIRMATION_REQUIRED", "REASON_REQUIRED"],
    });
  });

  it("plans the state and audit event without persistence", () => {
    const validated = validateAttentionLifecycleTransition({
      attentionId: before.id,
      targetStatus: "dismissed",
      reason: "O risco deixou de existir.",
      confirmed: true,
    });
    if (!validated.ok) throw new Error("fixture validation failed");

    expect(
      planAttentionLifecycleTransition(validated.value, context, before),
    ).toEqual({
      ok: true,
      attention: {
        ...before,
        status: "dismissed",
        resolvedAt: context.now,
        updatedAt: context.now,
      },
      audit: {
        id: "audit-1",
        actor: "owner-1",
        action: "attention.dismiss",
        entityType: "attention_item",
        entityId: before.id,
        before,
        after: {
          ...before,
          status: "dismissed",
          resolvedAt: context.now,
          updatedAt: context.now,
        },
        reason: "O risco deixou de existir.",
        occurredAt: context.now,
        source: "manual",
        confirmed: true,
        correlationId: "correlation-1",
      },
    });
  });

  it("rejects missing and already-final snapshots before persistence", () => {
    const validated = validateAttentionLifecycleTransition({
      attentionId: before.id,
      targetStatus: "resolved",
      reason: "Concluir item.",
      confirmed: true,
    });
    if (!validated.ok) throw new Error("fixture validation failed");

    expect(
      planAttentionLifecycleTransition(validated.value, context, null),
    ).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(
      planAttentionLifecycleTransition(
        validated.value,
        context,
        { ...before, status: "resolved" },
      ),
    ).toEqual({ ok: false, code: "ALREADY_FINAL" });
  });
});
