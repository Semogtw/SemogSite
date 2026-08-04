import { describe, expect, it } from "vitest";
import {
  distributeEqualIntegerWeights,
  proposeCheckpointWeightRebalance,
} from "./checkpoint-weights";

describe("distributeEqualIntegerWeights", () => {
  it("distributes three checkpoints as 34/33/33", () => {
    expect(distributeEqualIntegerWeights(["a", "b", "c"])).toEqual({
      a: 34,
      b: 33,
      c: 33,
    });
  });

  it("distributes six checkpoints deterministically", () => {
    expect(
      distributeEqualIntegerWeights(["a", "b", "c", "d", "e", "f"]),
    ).toEqual({ a: 17, b: 17, c: 17, d: 17, e: 16, f: 16 });
  });

  it("rejects empty, duplicate and over-100 checkpoint sets", () => {
    expect(() => distributeEqualIntegerWeights([])).toThrow(
      "CHECKPOINT_WEIGHT_IDS_REQUIRED",
    );
    expect(() => distributeEqualIntegerWeights(["a", "a"])).toThrow(
      "CHECKPOINT_WEIGHT_ID_DUPLICATE",
    );
    expect(() =>
      distributeEqualIntegerWeights(
        Array.from({ length: 101 }, (_, index) => `checkpoint-${index}`),
      ),
    ).toThrow("CHECKPOINT_WEIGHT_COUNT_OUT_OF_RANGE");
  });
});

describe("proposeCheckpointWeightRebalance", () => {
  it("rebalances all automatic weights without confirmation", () => {
    expect(
      proposeCheckpointWeightRebalance([
        { id: "a", weight: null, weightMode: "automatic" },
        { id: "b", weight: 50, weightMode: "automatic" },
        { id: "c", weight: 50, weightMode: "automatic" },
      ]),
    ).toEqual({
      checkpoints: [
        { id: "a", before: null, after: 34, weightMode: "automatic" },
        { id: "b", before: 50, after: 33, weightMode: "automatic" },
        { id: "c", before: 50, after: 33, weightMode: "automatic" },
      ],
      total: 100,
      requiresConfirmation: false,
      reason: "all_weights_automatic",
    });
  });

  it("preserves valid custom weights and distributes the remainder", () => {
    expect(
      proposeCheckpointWeightRebalance([
        { id: "custom", weight: 60, weightMode: "custom" },
        { id: "auto-a", weight: null, weightMode: "automatic" },
        { id: "auto-b", weight: null, weightMode: "automatic" },
      ]),
    ).toEqual({
      checkpoints: [
        { id: "custom", before: 60, after: 60, weightMode: "custom" },
        { id: "auto-a", before: null, after: 20, weightMode: "automatic" },
        { id: "auto-b", before: null, after: 20, weightMode: "automatic" },
      ],
      total: 100,
      requiresConfirmation: false,
      reason: "custom_weights_preserved",
    });
  });

  it("requires confirmation when custom weights cannot be preserved", () => {
    const proposal = proposeCheckpointWeightRebalance([
      { id: "custom", weight: 100, weightMode: "custom" },
      { id: "auto-a", weight: null, weightMode: "automatic" },
      { id: "auto-b", weight: null, weightMode: "automatic" },
    ]);

    expect(proposal).toEqual({
      checkpoints: [
        { id: "custom", before: 100, after: 34, weightMode: "custom" },
        { id: "auto-a", before: null, after: 33, weightMode: "automatic" },
        { id: "auto-b", before: null, after: 33, weightMode: "automatic" },
      ],
      total: 100,
      requiresConfirmation: true,
      reason: "custom_weights_need_rebalance",
    });
  });

  it("requires confirmation when custom-only weights do not total 100", () => {
    expect(
      proposeCheckpointWeightRebalance([
        { id: "a", weight: 60, weightMode: "custom" },
        { id: "b", weight: 20, weightMode: "custom" },
      ]),
    ).toMatchObject({
      checkpoints: [
        { id: "a", after: 50, weightMode: "custom" },
        { id: "b", after: 50, weightMode: "custom" },
      ],
      total: 100,
      requiresConfirmation: true,
      reason: "custom_weights_need_rebalance",
    });
  });

  it("rejects malformed custom and automatic inputs", () => {
    expect(() =>
      proposeCheckpointWeightRebalance([
        { id: "custom", weight: null, weightMode: "custom" },
      ]),
    ).toThrow("CUSTOM_CHECKPOINT_WEIGHT_REQUIRED");
    expect(() =>
      proposeCheckpointWeightRebalance([
        { id: "auto", weight: 0, weightMode: "automatic" },
      ]),
    ).toThrow("CHECKPOINT_WEIGHT_OUT_OF_RANGE");
  });
});
