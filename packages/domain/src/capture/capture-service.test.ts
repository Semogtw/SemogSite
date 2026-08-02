import { describe, expect, it, vi } from "vitest";
import {
  AttentionCaptureService,
  type AttentionCaptureRepository,
} from "./capture-service";

const context = {
  actorId: "semogtw-owner",
  attentionId: "attention-1",
  auditId: "audit-1",
  correlationId: "correlation-1",
  now: "2026-08-01T13:30:00.000Z",
};

describe("AttentionCaptureService", () => {
  it("persists a confirmed manual attention item with its audit event", async () => {
    const insertAttentionWithAudit = vi.fn<AttentionCaptureRepository["insertAttentionWithAudit"]>();
    const service = new AttentionCaptureService({ insertAttentionWithAudit });

    const result = await service.capture(
      {
        projectId: " project-1 ",
        type: "risk",
        impact: "high",
        title: "  Registry indisponível  ",
        nextAction: " Executar pnpm check em ambiente com acesso. ",
        reason: " Gate necessário antes da revisão. ",
        confirmed: true,
      },
      context,
    );

    expect(result).toEqual({
      ok: true,
      attention: {
        id: "attention-1",
        projectId: "project-1",
        type: "risk",
        status: "open",
        impact: "high",
        title: "Registry indisponível",
        owner: "owner",
        nextAction: "Executar pnpm check em ambiente com acesso.",
        source: "manual",
        createdAt: context.now,
        updatedAt: context.now,
      },
      audit: {
        id: "audit-1",
        actor: "semogtw-owner",
        action: "attention.create",
        entityType: "attention_item",
        entityId: "attention-1",
        before: null,
        after: expect.any(Object),
        reason: "Gate necessário antes da revisão.",
        occurredAt: context.now,
        source: "manual",
        confirmed: true,
        correlationId: "correlation-1",
      },
    });
    expect(insertAttentionWithAudit).toHaveBeenCalledTimes(1);
    expect(insertAttentionWithAudit).toHaveBeenCalledWith(
      result.ok ? result.attention : undefined,
      result.ok ? result.audit : undefined,
    );
  });

  it.each(["external_dependency", "critical_test"] as const)(
    "assigns %s captures to the external environment queue",
    async (type) => {
      const insertAttentionWithAudit = vi.fn<AttentionCaptureRepository["insertAttentionWithAudit"]>();
      const service = new AttentionCaptureService({ insertAttentionWithAudit });

      const result = await service.capture(
        {
          projectId: null,
          type,
          impact: "medium",
          title: "Executar validação externa",
          nextAction: "Executar o gate no ambiente apropriado.",
          reason: "A validação não pode ser executada neste runtime.",
          confirmed: true,
        },
        context,
      );

      expect(result).toMatchObject({
        ok: true,
        attention: {
          type,
          owner: "external_environment",
        },
      });
    },
  );

  it("rejects unconfirmed and empty captures without writing", async () => {
    const insertAttentionWithAudit = vi.fn<AttentionCaptureRepository["insertAttentionWithAudit"]>();
    const service = new AttentionCaptureService({ insertAttentionWithAudit });

    await expect(
      service.capture(
        {
          projectId: null,
          type: "decision",
          impact: "medium",
          title: "",
          nextAction: "",
          reason: "",
          confirmed: false,
        },
        context,
      ),
    ).resolves.toEqual({
      ok: false,
      errors: expect.arrayContaining([
        "CONFIRMATION_REQUIRED",
        "TITLE_REQUIRED",
        "NEXT_ACTION_REQUIRED",
        "REASON_REQUIRED",
      ]),
    });
    expect(insertAttentionWithAudit).not.toHaveBeenCalled();
  });

  it("rejects oversized content and normalizes an empty project id to null", async () => {
    const insertAttentionWithAudit = vi.fn<AttentionCaptureRepository["insertAttentionWithAudit"]>();
    const service = new AttentionCaptureService({ insertAttentionWithAudit });

    await expect(
      service.capture(
        {
          projectId: "   ",
          type: "blocker",
          impact: "low",
          title: "x".repeat(161),
          nextAction: "x".repeat(501),
          reason: "x".repeat(501),
          confirmed: true,
        },
        context,
      ),
    ).resolves.toEqual({
      ok: false,
      errors: ["TITLE_TOO_LONG", "NEXT_ACTION_TOO_LONG", "REASON_TOO_LONG"],
    });
    expect(insertAttentionWithAudit).not.toHaveBeenCalled();
  });
});
