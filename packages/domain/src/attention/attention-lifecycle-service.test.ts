import { describe, expect, it, vi } from "vitest";
import {
  AttentionLifecycleService,
  type AttentionLifecycleRepository,
  type AttentionLifecycleSnapshot,
} from "./attention-lifecycle-service";

const before: AttentionLifecycleSnapshot = {
  id: "attention-1",
  projectId: null,
  type: "risk",
  status: "open",
  impact: "high",
  title: "Executar build integral",
  owner: "owner",
  nextAction: "Rodar pnpm check em ambiente com registry completo.",
  source: "manual",
  resolvedAt: null,
  createdAt: "2026-08-01T13:30:00.000Z",
  updatedAt: "2026-08-01T13:30:00.000Z",
};

const context = {
  actorId: "semogtw-owner",
  auditId: "audit-2",
  correlationId: "correlation-2",
  now: "2026-08-01T15:30:00.000Z",
};

function createRepository(
  snapshot: AttentionLifecycleSnapshot | null = before,
  transitioned = true,
): AttentionLifecycleRepository {
  return {
    findById: vi.fn().mockResolvedValue(snapshot),
    transitionWithAudit: vi.fn().mockResolvedValue(transitioned),
  };
}

describe("AttentionLifecycleService", () => {
  it("resolves an active item and records a confirmed audit event", async () => {
    const repository = createRepository();
    const service = new AttentionLifecycleService(repository);

    const result = await service.transition(
      {
        attentionId: before.id,
        targetStatus: "resolved",
        reason: "O gate foi executado e a evidência foi registrada.",
        confirmed: true,
      },
      context,
    );

    expect(result).toEqual({
      ok: true,
      attention: {
        ...before,
        status: "resolved",
        resolvedAt: context.now,
        updatedAt: context.now,
      },
      audit: {
        id: "audit-2",
        actor: "semogtw-owner",
        action: "attention.resolve",
        entityType: "attention_item",
        entityId: before.id,
        before,
        after: {
          ...before,
          status: "resolved",
          resolvedAt: context.now,
          updatedAt: context.now,
        },
        reason: "O gate foi executado e a evidência foi registrada.",
        occurredAt: context.now,
        source: "manual",
        confirmed: true,
        correlationId: "correlation-2",
      },
    });
    expect(repository.transitionWithAudit).toHaveBeenCalledTimes(1);
  });

  it("rejects an unconfirmed transition with an empty reason", async () => {
    const repository = createRepository();
    const service = new AttentionLifecycleService(repository);

    await expect(
      service.transition(
        {
          attentionId: before.id,
          targetStatus: "dismissed",
          reason: "   ",
          confirmed: false,
        },
        context,
      ),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["CONFIRMATION_REQUIRED", "REASON_REQUIRED"],
    });
    expect(repository.findById).not.toHaveBeenCalled();
    expect(repository.transitionWithAudit).not.toHaveBeenCalled();
  });

  it("does not transition a missing or already final item", async () => {
    const missingService = new AttentionLifecycleService(createRepository(null));
    await expect(
      missingService.transition(
        {
          attentionId: "missing",
          targetStatus: "resolved",
          reason: "Registro inexistente.",
          confirmed: true,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "NOT_FOUND" });

    const finalService = new AttentionLifecycleService(
      createRepository({ ...before, status: "dismissed" }),
    );
    await expect(
      finalService.transition(
        {
          attentionId: before.id,
          targetStatus: "resolved",
          reason: "Tentativa tardia.",
          confirmed: true,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "ALREADY_FINAL" });
  });

  it("reports an optimistic concurrency conflict without claiming success", async () => {
    const repository = createRepository(before, false);
    const service = new AttentionLifecycleService(repository);

    await expect(
      service.transition(
        {
          attentionId: before.id,
          targetStatus: "dismissed",
          reason: "Não é mais relevante.",
          confirmed: true,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "CONFLICT" });
  });
});
