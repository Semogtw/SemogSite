import { describe, expect, it } from "vitest";
import {
  ApplyGrowthWeightRebalanceRequestSchema,
  PreviewGrowthWeightRebalanceRequestSchema,
} from "./devos-growth-weight-rebalance";

const validApply = {
  csrfToken: "csrf-token",
  idempotencyKey: "8c8c16cb-7367-4f96-86cf-afbbfbf84122",
  goalId: "goal-1",
  expectedGoalVersion: 3,
  expectedCheckpointVersions: [{ id: "checkpoint-1", version: 2 }],
  reason: "Redistribuir pesos",
  confirmed: true,
};

describe("Growth weight rebalance schemas", () => {
  it("accepts only identity, versions, reason and confirmation", () => {
    expect(ApplyGrowthWeightRebalanceRequestSchema.parse(validApply)).toEqual(
      validApply,
    );
    expect(
      PreviewGrowthWeightRebalanceRequestSchema.parse({ goalId: "goal-1" }),
    ).toEqual({ goalId: "goal-1" });
  });

  it("rejects browser-proposed weights and modes", () => {
    expect(
      ApplyGrowthWeightRebalanceRequestSchema.safeParse({
        ...validApply,
        weight: 10,
      }).success,
    ).toBe(false);
    expect(
      ApplyGrowthWeightRebalanceRequestSchema.safeParse({
        ...validApply,
        weightMode: "custom",
      }).success,
    ).toBe(false);
    expect(
      ApplyGrowthWeightRebalanceRequestSchema.safeParse({
        ...validApply,
        proposedWeights: [{ id: "checkpoint-1", weight: 100 }],
      }).success,
    ).toBe(false);
  });
});
