import type {
  CheckpointWeightMode,
  LearningGoalStatus,
} from "./model";
import type {
  GrowthClock,
  GrowthMutationContext,
  GrowthWriteResult,
} from "./ports";
import {
  proposeCheckpointWeightRebalance,
  type CheckpointWeightProposal,
} from "./checkpoint-weights";
import { validateIsoTimestamp } from "./validation";

export type CheckpointWeightSnapshotItem = {
  id: string;
  sequence: number;
  weight: number;
  weightMode: CheckpointWeightMode;
  version: number;
  updatedAt: string;
};

export type CheckpointWeightSnapshot = {
  goalId: string;
  ownerId: string;
  goalStatus: LearningGoalStatus;
  goalVersion: number;
  goalUpdatedAt: string;
  checkpoints: readonly CheckpointWeightSnapshotItem[];
};

export type CheckpointWeightReplayRequest = {
  ownerId: string;
  goalId: string;
  expectedGoalVersion: number;
  expectedCheckpointVersions: readonly { id: string; version: number }[];
  reason: string;
  context: GrowthMutationContext;
};

export type ApplyCheckpointWeightRebalanceRecord = {
  before: CheckpointWeightSnapshot;
  after: CheckpointWeightSnapshot;
  proposal: CheckpointWeightProposal;
  reason: string;
  occurredAt: string;
  context: GrowthMutationContext;
};

export interface CheckpointWeightRebalanceRepository {
  findReplay(
    input: CheckpointWeightReplayRequest,
  ): Promise<GrowthWriteResult<CheckpointWeightSnapshot> | null>;
  getSnapshot(
    ownerId: string,
    goalId: string,
  ): Promise<CheckpointWeightSnapshot | null>;
  apply(
    input: ApplyCheckpointWeightRebalanceRecord,
  ): Promise<GrowthWriteResult<CheckpointWeightSnapshot>>;
}

export type PreviewCheckpointWeightRebalanceResult =
  | {
      ok: true;
      proposal: CheckpointWeightProposal;
      goalVersion: number;
      checkpointVersions: readonly { id: string; version: number }[];
    }
  | {
      ok: false;
      code:
        | "VALIDATION_FAILED"
        | "GOAL_NOT_FOUND"
        | "GOAL_NOT_EDITABLE"
        | "CHECKPOINTS_REQUIRED";
    };

export type ApplyCheckpointWeightRebalanceInput = {
  goalId: string;
  expectedGoalVersion: number;
  expectedCheckpointVersions: readonly { id: string; version: number }[];
  reason: string;
  confirmed: boolean;
};

export type ApplyCheckpointWeightRebalanceResult =
  | {
      ok: true;
      snapshot: CheckpointWeightSnapshot;
      proposal: CheckpointWeightProposal;
      replayed: boolean;
    }
  | {
      ok: false;
      code:
        | "VALIDATION_FAILED"
        | "GOAL_NOT_FOUND"
        | "GOAL_NOT_EDITABLE"
        | "CHECKPOINTS_REQUIRED"
        | "CONFLICT";
    }
  | {
      ok: false;
      code: "CONFIRMATION_REQUIRED";
      proposal: CheckpointWeightProposal;
    };

function editable(status: LearningGoalStatus): boolean {
  return status === "draft" || status === "active" || status === "paused";
}

function normalizedGoalId(value: string): string | null {
  const result = value.trim();
  return result.length >= 1 && result.length <= 200 ? result : null;
}

function normalizedReason(value: string): string | null {
  const result = value.trim();
  return result.length >= 1 && result.length <= 500 ? result : null;
}

function positiveVersion(value: number): boolean {
  return Number.isInteger(value) && value >= 1;
}

function versionsValid(
  expected: readonly { id: string; version: number }[],
): boolean {
  if (expected.length === 0) return false;
  const normalized = expected.map((item) => item.id.trim());
  return (
    normalized.every((id) => id.length >= 1 && id.length <= 200) &&
    new Set(normalized).size === normalized.length &&
    expected.every((item) => positiveVersion(item.version))
  );
}

function versionsMatch(
  snapshot: CheckpointWeightSnapshot,
  expected: readonly { id: string; version: number }[],
): boolean {
  if (expected.length !== snapshot.checkpoints.length) return false;
  const byId = new Map(expected.map((item) => [item.id.trim(), item.version]));
  if (byId.size !== expected.length) return false;
  return snapshot.checkpoints.every(
    (checkpoint) => byId.get(checkpoint.id) === checkpoint.version,
  );
}

function proposalFor(snapshot: CheckpointWeightSnapshot): CheckpointWeightProposal {
  return proposeCheckpointWeightRebalance(
    [...snapshot.checkpoints]
      .sort((left, right) => left.sequence - right.sequence)
      .map((checkpoint) => ({
        id: checkpoint.id,
        weight: checkpoint.weight,
        weightMode: checkpoint.weightMode,
      })),
  );
}

export class CheckpointWeightRebalanceService {
  constructor(
    private readonly repository: CheckpointWeightRebalanceRepository,
    private readonly clock: GrowthClock,
  ) {}

  async preview(
    input: { goalId: string },
    context: GrowthMutationContext,
  ): Promise<PreviewCheckpointWeightRebalanceResult> {
    const goalId = normalizedGoalId(input.goalId);
    if (goalId === null) return { ok: false, code: "VALIDATION_FAILED" };
    const snapshot = await this.repository.getSnapshot(context.ownerId, goalId);
    if (snapshot === null) return { ok: false, code: "GOAL_NOT_FOUND" };
    if (!editable(snapshot.goalStatus)) {
      return { ok: false, code: "GOAL_NOT_EDITABLE" };
    }
    if (snapshot.checkpoints.length === 0) {
      return { ok: false, code: "CHECKPOINTS_REQUIRED" };
    }
    return {
      ok: true,
      proposal: proposalFor(snapshot),
      goalVersion: snapshot.goalVersion,
      checkpointVersions: snapshot.checkpoints.map(({ id, version }) => ({
        id,
        version,
      })),
    };
  }

  async apply(
    input: ApplyCheckpointWeightRebalanceInput,
    context: GrowthMutationContext,
  ): Promise<ApplyCheckpointWeightRebalanceResult> {
    const goalId = normalizedGoalId(input.goalId);
    const reason = normalizedReason(input.reason);
    if (
      goalId === null ||
      reason === null ||
      !positiveVersion(input.expectedGoalVersion) ||
      !versionsValid(input.expectedCheckpointVersions)
    ) {
      return { ok: false, code: "VALIDATION_FAILED" };
    }

    const replay = await this.repository.findReplay({
      ownerId: context.ownerId,
      goalId,
      expectedGoalVersion: input.expectedGoalVersion,
      expectedCheckpointVersions: input.expectedCheckpointVersions,
      reason,
      context,
    });
    if (replay !== null) {
      if (replay.kind === "conflict") return { ok: false, code: "CONFLICT" };
      return {
        ok: true,
        snapshot: replay.value,
        proposal: proposalFor(replay.value),
        replayed: true,
      };
    }

    const before = await this.repository.getSnapshot(context.ownerId, goalId);
    if (before === null) return { ok: false, code: "GOAL_NOT_FOUND" };
    if (!editable(before.goalStatus)) {
      return { ok: false, code: "GOAL_NOT_EDITABLE" };
    }
    if (before.checkpoints.length === 0) {
      return { ok: false, code: "CHECKPOINTS_REQUIRED" };
    }
    if (
      before.goalVersion !== input.expectedGoalVersion ||
      !versionsMatch(before, input.expectedCheckpointVersions)
    ) {
      return { ok: false, code: "CONFLICT" };
    }

    const proposal = proposalFor(before);
    if (proposal.requiresConfirmation && !input.confirmed) {
      return { ok: false, code: "CONFIRMATION_REQUIRED", proposal };
    }

    const weights = new Map(
      proposal.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]),
    );
    const occurredAt = validateIsoTimestamp(this.clock.now());
    const after: CheckpointWeightSnapshot = {
      ...before,
      checkpoints: before.checkpoints.map((checkpoint) => {
        const proposed = weights.get(checkpoint.id);
        if (proposed === undefined) {
          throw new Error("CHECKPOINT_WEIGHT_PROPOSAL_INCOMPLETE");
        }
        return {
          ...checkpoint,
          weight: proposed.after,
          weightMode: proposed.weightMode,
          version: checkpoint.version + 1,
          updatedAt: occurredAt,
        };
      }),
    };

    const result = await this.repository.apply({
      before,
      after,
      proposal,
      reason,
      occurredAt,
      context,
    });
    if (result.kind === "conflict") return { ok: false, code: "CONFLICT" };
    return {
      ok: true,
      snapshot: result.value,
      proposal,
      replayed: result.kind === "idempotent",
    };
  }
}
