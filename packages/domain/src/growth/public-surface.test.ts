import { describe, expect, it } from "vitest";
import {
  CheckpointWeightRebalanceService,
  QuickLearningGoalService,
  listLearningGoalTemplates,
  type CheckpointWeightReplayRequest,
  type QuickLearningGoalServiceResult,
} from "./index";

describe("Growth public package surface", () => {
  it("exports quick-create and checkpoint rebalance services", () => {
    const result: QuickLearningGoalServiceResult = {
      ok: false,
      code: "CONFLICT",
    };
    const replay: CheckpointWeightReplayRequest = {
      ownerId: "owner-1",
      goalId: "goal-1",
      expectedGoalVersion: 1,
      expectedCheckpointVersions: [{ id: "checkpoint-1", version: 1 }],
      reason: "Redistribuir pesos",
      context: {
        ownerId: "owner-1",
        actorId: "owner-1",
        correlationId: "correlation-1",
        idempotencyKey: "idempotency-1",
      },
    };

    expect(QuickLearningGoalService).toBeTypeOf("function");
    expect(CheckpointWeightRebalanceService).toBeTypeOf("function");
    expect(listLearningGoalTemplates()).toHaveLength(5);
    expect(result).toEqual({ ok: false, code: "CONFLICT" });
    expect(replay.goalId).toBe("goal-1");
  });
});
