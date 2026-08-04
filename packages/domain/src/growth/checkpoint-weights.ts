import { normalizeCheckpointWeight } from "./validation";

export type CheckpointWeightInput = {
  id: string;
  weight: number | null;
  weightMode: "automatic" | "custom";
};

export type CheckpointWeightProposal = {
  checkpoints: readonly {
    id: string;
    before: number | null;
    after: number;
    weightMode: "automatic" | "custom";
  }[];
  total: 100;
  requiresConfirmation: boolean;
  reason:
    | "all_weights_automatic"
    | "custom_weights_preserved"
    | "custom_weights_need_rebalance";
};

function normalizeIds(ids: readonly string[]): readonly string[] {
  if (ids.length === 0) throw new Error("CHECKPOINT_WEIGHT_IDS_REQUIRED");
  if (ids.length > 100) {
    throw new Error("CHECKPOINT_WEIGHT_COUNT_OUT_OF_RANGE");
  }
  const normalized = ids.map((id) => id.trim());
  if (normalized.some((id) => id.length === 0 || id.length > 200)) {
    throw new Error("CHECKPOINT_WEIGHT_ID_INVALID");
  }
  if (new Set(normalized).size !== normalized.length) {
    throw new Error("CHECKPOINT_WEIGHT_ID_DUPLICATE");
  }
  return normalized;
}

function distributeIntegerTotal(
  ids: readonly string[],
  total: number,
): Readonly<Record<string, number>> {
  if (total < ids.length) {
    throw new Error("CHECKPOINT_WEIGHT_REMAINDER_TOO_SMALL");
  }
  const base = Math.floor(total / ids.length);
  const remainder = total - base * ids.length;
  return Object.fromEntries(
    ids.map((id, index) => [id, base + (index < remainder ? 1 : 0)]),
  );
}

export function distributeEqualIntegerWeights(
  checkpointIds: readonly string[],
): Readonly<Record<string, number>> {
  const ids = normalizeIds(checkpointIds);
  return distributeIntegerTotal(ids, 100);
}

export function proposeCheckpointWeightRebalance(
  checkpoints: readonly CheckpointWeightInput[],
): CheckpointWeightProposal {
  const ids = normalizeIds(checkpoints.map((checkpoint) => checkpoint.id));
  const normalized = checkpoints.map((checkpoint, index) => {
    if (
      checkpoint.weightMode !== "automatic" &&
      checkpoint.weightMode !== "custom"
    ) {
      throw new Error("CHECKPOINT_WEIGHT_MODE_INVALID");
    }
    if (checkpoint.weightMode === "custom" && checkpoint.weight === null) {
      throw new Error("CUSTOM_CHECKPOINT_WEIGHT_REQUIRED");
    }
    if (checkpoint.weight !== null) normalizeCheckpointWeight(checkpoint.weight);
    return { ...checkpoint, id: ids[index]! };
  });

  const custom = normalized.filter(
    (checkpoint) => checkpoint.weightMode === "custom",
  );
  const automatic = normalized.filter(
    (checkpoint) => checkpoint.weightMode === "automatic",
  );

  if (custom.length === 0) {
    const weights = distributeEqualIntegerWeights(ids);
    return {
      checkpoints: normalized.map((checkpoint) => ({
        id: checkpoint.id,
        before: checkpoint.weight,
        after: weights[checkpoint.id]!,
        weightMode: checkpoint.weightMode,
      })),
      total: 100,
      requiresConfirmation: false,
      reason: "all_weights_automatic",
    };
  }

  const customTotal = custom.reduce(
    (total, checkpoint) => total + (checkpoint.weight ?? 0),
    0,
  );
  const remaining = 100 - customTotal;
  const canPreserveCustom =
    (automatic.length === 0 && customTotal === 100) ||
    (automatic.length > 0 && remaining >= automatic.length);

  if (canPreserveCustom) {
    const automaticWeights =
      automatic.length === 0
        ? {}
        : distributeIntegerTotal(
            automatic.map((checkpoint) => checkpoint.id),
            remaining,
          );
    return {
      checkpoints: normalized.map((checkpoint) => ({
        id: checkpoint.id,
        before: checkpoint.weight,
        after:
          checkpoint.weightMode === "custom"
            ? checkpoint.weight!
            : automaticWeights[checkpoint.id]!,
        weightMode: checkpoint.weightMode,
      })),
      total: 100,
      requiresConfirmation: false,
      reason: "custom_weights_preserved",
    };
  }

  const fallback = distributeEqualIntegerWeights(ids);
  return {
    checkpoints: normalized.map((checkpoint) => ({
      id: checkpoint.id,
      before: checkpoint.weight,
      after: fallback[checkpoint.id]!,
      weightMode: checkpoint.weightMode,
    })),
    total: 100,
    requiresConfirmation: true,
    reason: "custom_weights_need_rebalance",
  };
}
