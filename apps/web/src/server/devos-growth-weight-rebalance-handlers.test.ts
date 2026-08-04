import { describe, expect, it, vi } from "vitest";
import { createDevOSGrowthWeightRebalanceHandlers } from "./devos-growth-weight-rebalance-handlers";

const owner = { id: "owner-1", sessionId: "session-1" };
const previewResult = {
  ok: true as const,
  goalVersion: 3,
  checkpointVersions: [{ id: "a", version: 1 }],
  proposal: {
    checkpoints: [
      { id: "a", before: 100, after: 100, weightMode: "automatic" as const },
    ],
    total: 100 as const,
    requiresConfirmation: false,
    reason: "all_weights_automatic" as const,
  },
};

function dependencies() {
  const preview = vi.fn(async () => previewResult);
  const apply = vi.fn(async () => ({
    ok: true as const,
    snapshot: {
      goalId: "goal-1",
      ownerId: "owner-1",
      goalStatus: "active" as const,
      goalVersion: 3,
      goalUpdatedAt: "2026-08-04T00:00:00.000Z",
      checkpoints: [],
    },
    proposal: previewResult.proposal,
    replayed: false,
  }));
  const resolveOwner = vi.fn(async (): Promise<typeof owner | null> => owner);
  const authorizeMutation = vi.fn(
    async (): Promise<typeof owner | null> => owner,
  );
  return {
    resolveOwner,
    authorizeMutation,
    createService: vi.fn(async () => ({ preview, apply })),
    nextCorrelationId: () => "correlation-1",
    preview,
    apply,
  };
}

describe("DevOS Growth weight rebalance handlers", () => {
  it("resolves the owner before creating a preview service", async () => {
    const deps = dependencies();
    const handlers = createDevOSGrowthWeightRebalanceHandlers(deps);
    await expect(handlers.preview({ goalId: "goal-1" })).resolves.toEqual(previewResult);
    expect(deps.resolveOwner).toHaveBeenCalledOnce();
    expect(deps.createService).toHaveBeenCalledOnce();
    expect(deps.resolveOwner.mock.invocationCallOrder[0]).toBeLessThan(
      deps.createService.mock.invocationCallOrder[0]!,
    );
  });

  it("rejects invalid CSRF before opening storage", async () => {
    const deps = dependencies();
    deps.authorizeMutation.mockResolvedValue(null);
    const handlers = createDevOSGrowthWeightRebalanceHandlers(deps);
    await expect(
      handlers.apply({
        csrfToken: "invalid",
        idempotencyKey: "8c8c16cb-7367-4f96-86cf-afbbfbf84122",
        goalId: "goal-1",
        expectedGoalVersion: 3,
        expectedCheckpointVersions: [{ id: "a", version: 1 }],
        reason: "Redistribuir pesos",
        confirmed: true,
      }),
    ).resolves.toEqual({ ok: false, code: "CSRF_INVALID" });
    expect(deps.createService).not.toHaveBeenCalled();
  });

  it("passes versions and confirmation but never accepts client weights", async () => {
    const deps = dependencies();
    const handlers = createDevOSGrowthWeightRebalanceHandlers(deps);
    await handlers.apply({
      csrfToken: "csrf",
      idempotencyKey: "8c8c16cb-7367-4f96-86cf-afbbfbf84122",
      goalId: "goal-1",
      expectedGoalVersion: 3,
      expectedCheckpointVersions: [{ id: "a", version: 1 }],
      reason: "Redistribuir pesos",
      confirmed: true,
    });
    expect(deps.apply).toHaveBeenCalledWith(
      {
        goalId: "goal-1",
        expectedGoalVersion: 3,
        expectedCheckpointVersions: [{ id: "a", version: 1 }],
        reason: "Redistribuir pesos",
        confirmed: true,
      },
      expect.objectContaining({
        ownerId: "owner-1",
        idempotencyKey: "8c8c16cb-7367-4f96-86cf-afbbfbf84122",
      }),
    );
  });
});
