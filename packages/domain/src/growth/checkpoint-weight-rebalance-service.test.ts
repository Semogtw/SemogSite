import { describe, expect, it, vi } from "vitest";
import {
  CheckpointWeightRebalanceService,
  type CheckpointWeightRebalanceRepository,
  type CheckpointWeightSnapshot,
} from "./checkpoint-weight-rebalance-service";

const context = {
  ownerId: "owner-1",
  actorId: "owner-1",
  correlationId: "correlation-1",
  idempotencyKey: "idempotency-1",
};

function current(customWeight = 80): CheckpointWeightSnapshot {
  return {
    goalId: "goal-1",
    ownerId: "owner-1",
    goalStatus: "active",
    goalVersion: 3,
    goalUpdatedAt: "2026-08-04T04:00:00.000Z",
    checkpoints: [
      {
        id: "a",
        sequence: 1,
        weight: customWeight,
        weightMode: "custom",
        version: 2,
        updatedAt: "2026-08-04T04:00:00.000Z",
      },
      {
        id: "b",
        sequence: 2,
        weight: 20,
        weightMode: "automatic",
        version: 1,
        updatedAt: "2026-08-04T04:00:00.000Z",
      },
    ],
  };
}

function repository(snapshot = current()) {
  const apply = vi.fn(async (input) => ({
    kind: "applied" as const,
    value: input.after,
  }));
  return {
    findReplay: vi.fn(async () => null),
    getSnapshot: vi.fn(async () => snapshot),
    apply,
  } satisfies CheckpointWeightRebalanceRepository;
}

const versions = [
  { id: "a", version: 2 },
  { id: "b", version: 1 },
] as const;

describe("CheckpointWeightRebalanceService", () => {
  it("previews from the current server snapshot", async () => {
    const store = repository();
    const service = new CheckpointWeightRebalanceService(store, {
      now: () => "2026-08-04T05:00:00.000Z",
    });

    await expect(service.preview({ goalId: "goal-1" }, context)).resolves.toMatchObject({
      ok: true,
      goalVersion: 3,
      checkpointVersions: versions,
      proposal: { total: 100, reason: "custom_weights_preserved" },
    });
  });

  it("requires confirmation before changing a custom weight", async () => {
    const store = repository(current(100));
    const service = new CheckpointWeightRebalanceService(store, {
      now: () => "2026-08-04T05:00:00.000Z",
    });

    await expect(
      service.apply(
        {
          goalId: "goal-1",
          expectedGoalVersion: 3,
          expectedCheckpointVersions: versions,
          reason: "Redistribuir pesos",
          confirmed: false,
        },
        context,
      ),
    ).resolves.toMatchObject({
      ok: false,
      code: "CONFIRMATION_REQUIRED",
      proposal: { requiresConfirmation: true },
    });
    expect(store.apply).not.toHaveBeenCalled();
  });

  it("rejects stale versions before persistence", async () => {
    const store = repository();
    const service = new CheckpointWeightRebalanceService(store, {
      now: () => "2026-08-04T05:00:00.000Z",
    });

    await expect(
      service.apply(
        {
          goalId: "goal-1",
          expectedGoalVersion: 3,
          expectedCheckpointVersions: [{ id: "a", version: 1 }],
          reason: "Redistribuir pesos",
          confirmed: true,
        },
        context,
      ),
    ).resolves.toEqual({ ok: false, code: "CONFLICT" });
    expect(store.apply).not.toHaveBeenCalled();
  });

  it("persists only the proposal recomputed by the service", async () => {
    const store = repository();
    const service = new CheckpointWeightRebalanceService(store, {
      now: () => "2026-08-04T05:00:00.000Z",
    });

    await expect(
      service.apply(
        {
          goalId: "goal-1",
          expectedGoalVersion: 3,
          expectedCheckpointVersions: versions,
          reason: "Redistribuir pesos",
          confirmed: true,
        },
        context,
      ),
    ).resolves.toMatchObject({ ok: true, replayed: false });
    expect(store.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        proposal: expect.objectContaining({ total: 100 }),
        after: expect.objectContaining({
          checkpoints: [
            expect.objectContaining({ id: "a", version: 3 }),
            expect.objectContaining({ id: "b", version: 2 }),
          ],
        }),
      }),
    );
  });
});
