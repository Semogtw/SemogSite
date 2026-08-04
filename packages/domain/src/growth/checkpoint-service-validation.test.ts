import { describe, expect, it } from "vitest";
import { LearningCheckpointService } from "./checkpoint-service";
import type {
  LearningCheckpointRepository,
  LearningGoalRepository,
} from "./ports";

const goalRepository: LearningGoalRepository = {
  async create() {
    throw new Error("NOT_USED");
  },
  async getById() {
    throw new Error("SHOULD_NOT_READ_INVALID_INPUT");
  },
  async update() {
    throw new Error("NOT_USED");
  },
};

const checkpointRepository: LearningCheckpointRepository = {
  async add() {
    throw new Error("SHOULD_NOT_WRITE_INVALID_INPUT");
  },
  async update() {
    throw new Error("NOT_USED");
  },
  async reorder() {
    throw new Error("NOT_USED");
  },
};

const service = new LearningCheckpointService(
  goalRepository,
  checkpointRepository,
  { now: () => "2026-08-04T01:00:00.000Z" },
  { next: (prefix) => `${prefix}-1` },
);

const context = {
  ownerId: "owner-1",
  actorId: "owner-1",
  correlationId: "correlation-1",
  idempotencyKey: "idempotency-1",
} as const;

describe("LearningCheckpointService validation mapping", () => {
  it("returns a stable result for invalid checkpoint weight", async () => {
    await expect(
      service.add(
        {
          goalId: "goal-1",
          expectedGoalVersion: 1,
          title: "Prática",
          description: "",
          required: true,
          weight: 0,
          completionMode: { kind: "binary" },
          dueDate: null,
        },
        context,
      ),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["CHECKPOINT_WEIGHT_OUT_OF_RANGE"],
    });
  });

  it("returns a stable result for an invalid numeric completion target", async () => {
    await expect(
      service.add(
        {
          goalId: "goal-1",
          expectedGoalVersion: 1,
          title: "Prática",
          description: "",
          required: true,
          weight: 100,
          completionMode: { kind: "numeric", unit: "horas", target: 0 },
          dueDate: null,
        },
        context,
      ),
    ).resolves.toEqual({
      ok: false,
      code: "VALIDATION_FAILED",
      errors: ["CHECKPOINT_NUMERIC_TARGET_MUST_BE_POSITIVE"],
    });
  });
});
