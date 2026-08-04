import type {
  CheckpointCompletionMode,
  LearningCheckpointStatus,
} from "./model";
import {
  normalizeCheckpointWeight,
  validateCompletionMode,
  validateLearningCheckpointStatus,
} from "./validation";

export type CheckpointProgressInput = {
  checkpointId: string;
  required: boolean;
  status: LearningCheckpointStatus;
  weight: number;
  completionMode: CheckpointCompletionMode;
  acceptedValue: number | null;
};

export type GoalProgressExplanation = {
  checkpointId: string;
  ratio: number;
  weightedContribution: number;
};

export type GoalProgressProjection = {
  percent: number | null;
  measurable: boolean;
  completedWeight: number;
  effectiveWeight: number;
  requiredCheckpointsComplete: boolean;
  explanation: readonly GoalProgressExplanation[];
};

function fail(code: string): never {
  throw new Error(code);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function roundToTwoDecimals(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function deriveCheckpointRatio(input: {
  status: LearningCheckpointStatus;
  completionMode: CheckpointCompletionMode;
  acceptedValue: number | null;
}): number {
  if (input.status === "waived") {
    return 1;
  }

  if (input.completionMode.kind === "binary") {
    return input.status === "completed" ? 1 : 0;
  }

  if (input.acceptedValue === null) {
    return 0;
  }

  if (!Number.isFinite(input.acceptedValue)) {
    fail("CHECKPOINT_ACCEPTED_VALUE_MUST_BE_FINITE");
  }

  return clamp(input.acceptedValue / input.completionMode.target, 0, 1);
}

export function deriveGoalProgress(
  checkpoints: readonly CheckpointProgressInput[],
): GoalProgressProjection {
  const seenIds = new Set<string>();
  const explanation: GoalProgressExplanation[] = [];
  let effectiveWeight = 0;
  let completedWeight = 0;
  let requiredCheckpointsComplete = true;
  let hasRequiredCheckpoint = false;

  for (const checkpoint of checkpoints) {
    const checkpointId = checkpoint.checkpointId.trim();
    if (checkpointId.length === 0) {
      fail("CHECKPOINT_ID_REQUIRED");
    }
    if (seenIds.has(checkpointId)) {
      fail("CHECKPOINT_ID_DUPLICATE");
    }
    seenIds.add(checkpointId);

    const status = validateLearningCheckpointStatus(checkpoint.status);
    const weight = normalizeCheckpointWeight(checkpoint.weight);
    const completionMode = validateCompletionMode(checkpoint.completionMode);

    if (
      checkpoint.acceptedValue !== null &&
      !Number.isFinite(checkpoint.acceptedValue)
    ) {
      fail("CHECKPOINT_ACCEPTED_VALUE_MUST_BE_FINITE");
    }

    if (status === "cancelled") {
      continue;
    }

    const ratio = deriveCheckpointRatio({
      status,
      completionMode,
      acceptedValue: checkpoint.acceptedValue,
    });
    const weightedContribution = weight * ratio;

    effectiveWeight += weight;
    completedWeight += weightedContribution;
    explanation.push({
      checkpointId,
      ratio,
      weightedContribution,
    });

    if (checkpoint.required) {
      hasRequiredCheckpoint = true;
      if (ratio < 1) {
        requiredCheckpointsComplete = false;
      }
    }
  }

  if (effectiveWeight === 0) {
    return {
      percent: null,
      measurable: false,
      completedWeight: 0,
      effectiveWeight: 0,
      requiredCheckpointsComplete: false,
      explanation: [],
    };
  }

  return {
    percent: roundToTwoDecimals((completedWeight / effectiveWeight) * 100),
    measurable: true,
    completedWeight,
    effectiveWeight,
    requiredCheckpointsComplete:
      !hasRequiredCheckpoint || requiredCheckpointsComplete,
    explanation,
  };
}
