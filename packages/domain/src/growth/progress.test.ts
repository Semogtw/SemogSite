import { describe, expect, it } from "vitest";
import { deriveGoalProgress } from "./progress";

describe("deriveGoalProgress", () => {
  it("derives weighted binary and numeric progress", () => {
    const projection = deriveGoalProgress([
      {
        checkpointId: "foundation",
        required: true,
        status: "completed",
        weight: 20,
        completionMode: { kind: "binary" },
        acceptedValue: null,
      },
      {
        checkpointId: "practice",
        required: true,
        status: "in_progress",
        weight: 80,
        completionMode: { kind: "numeric", unit: "exercícios", target: 100 },
        acceptedValue: 50,
      },
    ]);

    expect(projection).toEqual({
      percent: 60,
      measurable: true,
      completedWeight: 60,
      effectiveWeight: 100,
      requiredCheckpointsComplete: false,
      explanation: [
        {
          checkpointId: "foundation",
          ratio: 1,
          weightedContribution: 20,
        },
        {
          checkpointId: "practice",
          ratio: 0.5,
          weightedContribution: 40,
        },
      ],
    });
  });

  it("clamps numeric values to the zero-to-one range", () => {
    const projection = deriveGoalProgress([
      {
        checkpointId: "negative",
        required: false,
        status: "in_progress",
        weight: 40,
        completionMode: { kind: "numeric", unit: "horas", target: 10 },
        acceptedValue: -5,
      },
      {
        checkpointId: "over-target",
        required: true,
        status: "completed",
        weight: 60,
        completionMode: { kind: "numeric", unit: "horas", target: 10 },
        acceptedValue: 20,
      },
    ]);

    expect(projection.percent).toBe(60);
    expect(projection.explanation.map((entry) => entry.ratio)).toEqual([0, 1]);
    expect(projection.requiredCheckpointsComplete).toBe(true);
  });

  it("counts waived checkpoints as satisfied and excludes cancelled checkpoints", () => {
    const projection = deriveGoalProgress([
      {
        checkpointId: "waived",
        required: true,
        status: "waived",
        weight: 25,
        completionMode: { kind: "binary" },
        acceptedValue: null,
      },
      {
        checkpointId: "cancelled",
        required: true,
        status: "cancelled",
        weight: 75,
        completionMode: { kind: "binary" },
        acceptedValue: null,
      },
    ]);

    expect(projection.percent).toBe(100);
    expect(projection.completedWeight).toBe(25);
    expect(projection.effectiveWeight).toBe(25);
    expect(projection.requiredCheckpointsComplete).toBe(true);
    expect(projection.explanation).toHaveLength(1);
  });

  it("returns an indeterminate projection without effective checkpoints", () => {
    expect(deriveGoalProgress([])).toEqual({
      percent: null,
      measurable: false,
      completedWeight: 0,
      effectiveWeight: 0,
      requiredCheckpointsComplete: false,
      explanation: [],
    });

    expect(
      deriveGoalProgress([
        {
          checkpointId: "cancelled",
          required: false,
          status: "cancelled",
          weight: 100,
          completionMode: { kind: "binary" },
          acceptedValue: null,
        },
      ]),
    ).toEqual({
      percent: null,
      measurable: false,
      completedWeight: 0,
      effectiveWeight: 0,
      requiredCheckpointsComplete: false,
      explanation: [],
    });
  });

  it("rounds only the displayed percentage to two decimals", () => {
    const projection = deriveGoalProgress([
      {
        checkpointId: "one-third",
        required: false,
        status: "in_progress",
        weight: 100,
        completionMode: { kind: "numeric", unit: "partes", target: 3 },
        acceptedValue: 1,
      },
    ]);

    expect(projection.percent).toBe(33.33);
    expect(projection.completedWeight).toBeCloseTo(100 / 3, 10);
  });

  it("rejects duplicate IDs, invalid weights, targets and accepted values", () => {
    expect(() =>
      deriveGoalProgress([
        {
          checkpointId: "duplicate",
          required: false,
          status: "pending",
          weight: 50,
          completionMode: { kind: "binary" },
          acceptedValue: null,
        },
        {
          checkpointId: "duplicate",
          required: false,
          status: "pending",
          weight: 50,
          completionMode: { kind: "binary" },
          acceptedValue: null,
        },
      ]),
    ).toThrow("CHECKPOINT_ID_DUPLICATE");

    expect(() =>
      deriveGoalProgress([
        {
          checkpointId: "weight",
          required: false,
          status: "pending",
          weight: 0,
          completionMode: { kind: "binary" },
          acceptedValue: null,
        },
      ]),
    ).toThrow("CHECKPOINT_WEIGHT_OUT_OF_RANGE");

    expect(() =>
      deriveGoalProgress([
        {
          checkpointId: "value",
          required: false,
          status: "in_progress",
          weight: 100,
          completionMode: { kind: "numeric", unit: "horas", target: 10 },
          acceptedValue: Number.NaN,
        },
      ]),
    ).toThrow("CHECKPOINT_ACCEPTED_VALUE_MUST_BE_FINITE");
  });
});
