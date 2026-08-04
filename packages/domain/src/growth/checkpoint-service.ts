import type {
  CheckpointCompletionMode,
  LearningCheckpointRecord,
  LearningCheckpointStatus,
  LearningGoalAggregate,
} from "./model";
import type {
  GrowthClock,
  GrowthIdGenerator,
  GrowthMutationContext,
  LearningCheckpointRepository,
  LearningGoalRepository,
} from "./ports";
import {
  normalizeCheckpointWeight,
  validateCompletionMode,
  validateIsoTimestamp,
} from "./validation";

export type AddLearningCheckpointInput = {
  goalId: string;
  expectedGoalVersion: number;
  title: string;
  description: string;
  required: boolean;
  weight: number;
  completionMode: CheckpointCompletionMode;
  dueDate: string | null;
};

export type RecordLearningCheckpointValueInput = {
  goalId: string;
  checkpointId: string;
  expectedCheckpointVersion: number;
  acceptedValue: number;
  reason: string;
};

export type LearningCheckpointTransitionAction =
  | "start"
  | "complete"
  | "waive"
  | "cancel";

export type TransitionLearningCheckpointInput = {
  goalId: string;
  checkpointId: string;
  expectedCheckpointVersion: number;
  action: LearningCheckpointTransitionAction;
  reason: string;
  confirmed: boolean;
};

export type ReorderLearningCheckpointsInput = {
  goalId: string;
  expectedGoalVersion: number;
  orderedCheckpointIds: readonly string[];
  reason: string;
};

export type LearningCheckpointValidationError =
  | "GOAL_ID_REQUIRED"
  | "CHECKPOINT_ID_REQUIRED"
  | "EXPECTED_VERSION_INVALID"
  | "CHECKPOINT_TITLE_REQUIRED"
  | "CHECKPOINT_TITLE_TOO_LONG"
  | "CHECKPOINT_DESCRIPTION_TOO_LONG"
  | "CHECKPOINT_DUE_DATE_INVALID"
  | "CHECKPOINT_ACCEPTED_VALUE_MUST_BE_FINITE"
  | "CHECKPOINT_ACCEPTED_VALUE_NEGATIVE"
  | "REASON_REQUIRED"
  | "REASON_TOO_LONG"
  | "CONFIRMATION_REQUIRED"
  | "CHECKPOINT_ORDER_REQUIRED"
  | "CHECKPOINT_ORDER_DUPLICATE";

export type LearningCheckpointMutationResult =
  | {
      ok: true;
      checkpoint: LearningCheckpointRecord;
      replayed: boolean;
    }
  | {
      ok: false;
      code: "VALIDATION_FAILED";
      errors: readonly LearningCheckpointValidationError[];
    }
  | {
      ok: false;
      code:
        | "GOAL_NOT_FOUND"
        | "CHECKPOINT_NOT_FOUND"
        | "CONFLICT"
        | "GOAL_NOT_EDITABLE"
        | "INVALID_TRANSITION"
        | "CHECKPOINT_MODE_NOT_NUMERIC"
        | "CHECKPOINT_TARGET_NOT_REACHED";
    };

export type LearningCheckpointReorderResult =
  | {
      ok: true;
      checkpoints: readonly LearningCheckpointRecord[];
      replayed: boolean;
    }
  | {
      ok: false;
      code: "VALIDATION_FAILED";
      errors: readonly LearningCheckpointValidationError[];
    }
  | {
      ok: false;
      code:
        | "GOAL_NOT_FOUND"
        | "CONFLICT"
        | "GOAL_NOT_EDITABLE"
        | "CHECKPOINT_ORDER_MISMATCH";
    };

function normalizeTitle(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0) throw new Error("CHECKPOINT_TITLE_REQUIRED");
  if (normalized.length > 200) throw new Error("CHECKPOINT_TITLE_TOO_LONG");
  return normalized;
}

function normalizeDescription(value: string): string {
  const normalized = value.trim();
  if (normalized.length > 5_000) {
    throw new Error("CHECKPOINT_DESCRIPTION_TOO_LONG");
  }
  return normalized;
}

function validateDate(value: string | null): string | null {
  if (value === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("CHECKPOINT_DUE_DATE_INVALID");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("CHECKPOINT_DUE_DATE_INVALID");
  }
  return value;
}

function normalizeReason(value: string): LearningCheckpointValidationError[] {
  const normalized = value.trim();
  if (normalized.length === 0) return ["REASON_REQUIRED"];
  if (normalized.length > 500) return ["REASON_TOO_LONG"];
  return [];
}

function exceptionValidationError(
  error: unknown,
): LearningCheckpointValidationError | null {
  if (!(error instanceof Error)) return null;
  const supported = new Set<LearningCheckpointValidationError>([
    "CHECKPOINT_TITLE_REQUIRED",
    "CHECKPOINT_TITLE_TOO_LONG",
    "CHECKPOINT_DESCRIPTION_TOO_LONG",
    "CHECKPOINT_DUE_DATE_INVALID",
  ]);
  const code = error.message as LearningCheckpointValidationError;
  return supported.has(code) ? code : null;
}

function goalEditable(goal: LearningGoalAggregate): boolean {
  return (
    goal.status === "draft" ||
    goal.status === "active" ||
    goal.status === "paused"
  );
}

function findCheckpoint(
  goal: LearningGoalAggregate,
  checkpointId: string,
): LearningCheckpointRecord | null {
  return goal.checkpoints.find((checkpoint) => checkpoint.id === checkpointId) ?? null;
}

function nextTransitionStatus(input: {
  current: LearningCheckpointStatus;
  action: LearningCheckpointTransitionAction;
  completionMode: CheckpointCompletionMode;
  acceptedValue: number | null;
}): LearningCheckpointStatus | null {
  switch (input.action) {
    case "start":
      return input.current === "pending" ? "in_progress" : null;
    case "complete":
      if (input.current !== "pending" && input.current !== "in_progress") {
        return null;
      }
      if (
        input.completionMode.kind === "numeric" &&
        (input.acceptedValue === null ||
          input.acceptedValue < input.completionMode.target)
      ) {
        return null;
      }
      return "completed";
    case "waive":
      return input.current === "pending" || input.current === "in_progress"
        ? "waived"
        : null;
    case "cancel":
      return input.current === "pending" || input.current === "in_progress"
        ? "cancelled"
        : null;
  }
}

export class LearningCheckpointService {
  constructor(
    private readonly goalRepository: LearningGoalRepository,
    private readonly checkpointRepository: LearningCheckpointRepository,
    private readonly clock: GrowthClock,
    private readonly ids: GrowthIdGenerator,
  ) {}

  async add(
    input: AddLearningCheckpointInput,
    context: GrowthMutationContext,
  ): Promise<LearningCheckpointMutationResult> {
    const goalId = input.goalId.trim();
    const errors: LearningCheckpointValidationError[] = [];
    if (goalId.length === 0) errors.push("GOAL_ID_REQUIRED");
    if (
      !Number.isInteger(input.expectedGoalVersion) ||
      input.expectedGoalVersion < 1
    ) {
      errors.push("EXPECTED_VERSION_INVALID");
    }
    if (errors.length > 0) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }

    try {
      const title = normalizeTitle(input.title);
      const description = normalizeDescription(input.description);
      const weight = normalizeCheckpointWeight(input.weight);
      const completionMode = validateCompletionMode(input.completionMode);
      const dueDate = validateDate(input.dueDate);
      const goal = await this.goalRepository.getById(context.ownerId, goalId);
      if (goal === null) return { ok: false, code: "GOAL_NOT_FOUND" };
      if (goal.version !== input.expectedGoalVersion) {
        return { ok: false, code: "CONFLICT" };
      }
      if (!goalEditable(goal)) return { ok: false, code: "GOAL_NOT_EDITABLE" };

      const now = validateIsoTimestamp(this.clock.now());
      const maximumSequence = goal.checkpoints.reduce(
        (maximum, checkpoint) => Math.max(maximum, checkpoint.sequence),
        0,
      );
      const checkpoint: LearningCheckpointRecord = {
        id: this.ids.next("checkpoint"),
        goalId: goal.id,
        title,
        description,
        status: "pending",
        required: input.required,
        sequence: maximumSequence + 1,
        weight,
        completionMode,
        acceptedValue: null,
        dueDate,
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
      const result = await this.checkpointRepository.add({
        goal,
        checkpoint,
        event: {
          id: this.ids.next("checkpoint_event"),
          aggregateType: "learning_checkpoint",
          aggregateId: checkpoint.id,
          sequence: 1,
          action: "learning_checkpoint.add",
          before: null,
          after: checkpoint,
          reason: "Add learning checkpoint",
          actorId: context.actorId,
          occurredAt: now,
          correlationId: context.correlationId,
          idempotencyKey: context.idempotencyKey,
        },
        context,
      });
      if (result.kind === "conflict") return { ok: false, code: "CONFLICT" };
      return {
        ok: true,
        checkpoint: result.value,
        replayed: result.kind === "idempotent",
      };
    } catch (error) {
      const validationError = exceptionValidationError(error);
      if (validationError !== null) {
        return {
          ok: false,
          code: "VALIDATION_FAILED",
          errors: [validationError],
        };
      }
      throw error;
    }
  }

  async recordAcceptedValue(
    input: RecordLearningCheckpointValueInput,
    context: GrowthMutationContext,
  ): Promise<LearningCheckpointMutationResult> {
    const normalized = this.validateTargetAndReason({
      goalId: input.goalId,
      checkpointId: input.checkpointId,
      expectedVersion: input.expectedCheckpointVersion,
      reason: input.reason,
      confirmed: true,
      confirmationRequired: false,
    });
    if (!normalized.ok) return normalized.result;
    if (!Number.isFinite(input.acceptedValue)) {
      return {
        ok: false,
        code: "VALIDATION_FAILED",
        errors: ["CHECKPOINT_ACCEPTED_VALUE_MUST_BE_FINITE"],
      };
    }
    if (input.acceptedValue < 0) {
      return {
        ok: false,
        code: "VALIDATION_FAILED",
        errors: ["CHECKPOINT_ACCEPTED_VALUE_NEGATIVE"],
      };
    }

    const loaded = await this.loadEditableCheckpoint(
      normalized.goalId,
      normalized.checkpointId,
      input.expectedCheckpointVersion,
      context.ownerId,
    );
    if (!loaded.ok) return loaded.result;
    if (loaded.checkpoint.completionMode.kind !== "numeric") {
      return { ok: false, code: "CHECKPOINT_MODE_NOT_NUMERIC" };
    }
    if (
      loaded.checkpoint.status === "waived" ||
      loaded.checkpoint.status === "cancelled"
    ) {
      return { ok: false, code: "INVALID_TRANSITION" };
    }

    const status: LearningCheckpointStatus =
      input.acceptedValue >= loaded.checkpoint.completionMode.target
        ? "completed"
        : "in_progress";
    return this.persistUpdate({
      goal: loaded.goal,
      before: loaded.checkpoint,
      after: {
        ...loaded.checkpoint,
        acceptedValue: input.acceptedValue,
        status,
        updatedAt: validateIsoTimestamp(this.clock.now()),
        version: loaded.checkpoint.version + 1,
      },
      action: "learning_checkpoint.record_value",
      reason: normalized.reason,
      context,
    });
  }

  async transition(
    input: TransitionLearningCheckpointInput,
    context: GrowthMutationContext,
  ): Promise<LearningCheckpointMutationResult> {
    const confirmationRequired =
      input.action === "waive" || input.action === "cancel";
    const normalized = this.validateTargetAndReason({
      goalId: input.goalId,
      checkpointId: input.checkpointId,
      expectedVersion: input.expectedCheckpointVersion,
      reason: input.reason,
      confirmed: input.confirmed,
      confirmationRequired,
    });
    if (!normalized.ok) return normalized.result;

    const loaded = await this.loadEditableCheckpoint(
      normalized.goalId,
      normalized.checkpointId,
      input.expectedCheckpointVersion,
      context.ownerId,
    );
    if (!loaded.ok) return loaded.result;

    const status = nextTransitionStatus({
      current: loaded.checkpoint.status,
      action: input.action,
      completionMode: loaded.checkpoint.completionMode,
      acceptedValue: loaded.checkpoint.acceptedValue,
    });
    if (status === null) {
      if (
        input.action === "complete" &&
        loaded.checkpoint.completionMode.kind === "numeric" &&
        (loaded.checkpoint.acceptedValue === null ||
          loaded.checkpoint.acceptedValue <
            loaded.checkpoint.completionMode.target)
      ) {
        return { ok: false, code: "CHECKPOINT_TARGET_NOT_REACHED" };
      }
      return { ok: false, code: "INVALID_TRANSITION" };
    }

    return this.persistUpdate({
      goal: loaded.goal,
      before: loaded.checkpoint,
      after: {
        ...loaded.checkpoint,
        status,
        updatedAt: validateIsoTimestamp(this.clock.now()),
        version: loaded.checkpoint.version + 1,
      },
      action: `learning_checkpoint.${input.action}`,
      reason: normalized.reason,
      context,
    });
  }

  async reorder(
    input: ReorderLearningCheckpointsInput,
    context: GrowthMutationContext,
  ): Promise<LearningCheckpointReorderResult> {
    const goalId = input.goalId.trim();
    const reason = input.reason.trim();
    const errors: LearningCheckpointValidationError[] = [];
    if (goalId.length === 0) errors.push("GOAL_ID_REQUIRED");
    if (
      !Number.isInteger(input.expectedGoalVersion) ||
      input.expectedGoalVersion < 1
    ) {
      errors.push("EXPECTED_VERSION_INVALID");
    }
    if (input.orderedCheckpointIds.length === 0) {
      errors.push("CHECKPOINT_ORDER_REQUIRED");
    }
    const normalizedIds = input.orderedCheckpointIds.map((id) => id.trim());
    if (
      normalizedIds.some((id) => id.length === 0) ||
      new Set(normalizedIds).size !== normalizedIds.length
    ) {
      errors.push("CHECKPOINT_ORDER_DUPLICATE");
    }
    errors.push(...normalizeReason(reason));
    if (errors.length > 0) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }

    const goal = await this.goalRepository.getById(context.ownerId, goalId);
    if (goal === null) return { ok: false, code: "GOAL_NOT_FOUND" };
    if (goal.version !== input.expectedGoalVersion) {
      return { ok: false, code: "CONFLICT" };
    }
    if (!goalEditable(goal)) return { ok: false, code: "GOAL_NOT_EDITABLE" };

    const existingIds = new Set(goal.checkpoints.map((checkpoint) => checkpoint.id));
    if (
      existingIds.size !== normalizedIds.length ||
      normalizedIds.some((id) => !existingIds.has(id))
    ) {
      return { ok: false, code: "CHECKPOINT_ORDER_MISMATCH" };
    }

    const byId = new Map(
      goal.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]),
    );
    const now = validateIsoTimestamp(this.clock.now());
    const after = normalizedIds.map((id, index) => {
      const checkpoint = byId.get(id);
      if (checkpoint === undefined) {
        throw new Error("CHECKPOINT_ORDER_MISMATCH");
      }
      return {
        ...checkpoint,
        sequence: index + 1,
        updatedAt: now,
        version: checkpoint.version + 1,
      };
    });
    const result = await this.checkpointRepository.reorder({
      goal,
      before: goal.checkpoints,
      after,
      event: {
        id: this.ids.next("checkpoint_event"),
        aggregateType: "learning_goal",
        aggregateId: goal.id,
        sequence: goal.version + 1,
        action: "learning_checkpoint.reorder",
        before: goal.checkpoints,
        after,
        reason,
        actorId: context.actorId,
        occurredAt: now,
        correlationId: context.correlationId,
        idempotencyKey: context.idempotencyKey,
      },
      context,
    });
    if (result.kind === "conflict") return { ok: false, code: "CONFLICT" };
    return {
      ok: true,
      checkpoints: result.value,
      replayed: result.kind === "idempotent",
    };
  }

  private validateTargetAndReason(input: {
    goalId: string;
    checkpointId: string;
    expectedVersion: number;
    reason: string;
    confirmed: boolean;
    confirmationRequired: boolean;
  }):
    | { ok: true; goalId: string; checkpointId: string; reason: string }
    | { ok: false; result: LearningCheckpointMutationResult } {
    const goalId = input.goalId.trim();
    const checkpointId = input.checkpointId.trim();
    const reason = input.reason.trim();
    const errors: LearningCheckpointValidationError[] = [];
    if (goalId.length === 0) errors.push("GOAL_ID_REQUIRED");
    if (checkpointId.length === 0) errors.push("CHECKPOINT_ID_REQUIRED");
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
      errors.push("EXPECTED_VERSION_INVALID");
    }
    errors.push(...normalizeReason(reason));
    if (input.confirmationRequired && !input.confirmed) {
      errors.push("CONFIRMATION_REQUIRED");
    }
    if (errors.length > 0) {
      return {
        ok: false,
        result: { ok: false, code: "VALIDATION_FAILED", errors },
      };
    }
    return { ok: true, goalId, checkpointId, reason };
  }

  private async loadEditableCheckpoint(
    goalId: string,
    checkpointId: string,
    expectedCheckpointVersion: number,
    ownerId: string,
  ):
    Promise<
      | {
          ok: true;
          goal: LearningGoalAggregate;
          checkpoint: LearningCheckpointRecord;
        }
      | { ok: false; result: LearningCheckpointMutationResult }
    > {
    const goal = await this.goalRepository.getById(ownerId, goalId);
    if (goal === null) {
      return { ok: false, result: { ok: false, code: "GOAL_NOT_FOUND" } };
    }
    if (!goalEditable(goal)) {
      return { ok: false, result: { ok: false, code: "GOAL_NOT_EDITABLE" } };
    }
    const checkpoint = findCheckpoint(goal, checkpointId);
    if (checkpoint === null) {
      return {
        ok: false,
        result: { ok: false, code: "CHECKPOINT_NOT_FOUND" },
      };
    }
    if (checkpoint.version !== expectedCheckpointVersion) {
      return { ok: false, result: { ok: false, code: "CONFLICT" } };
    }
    return { ok: true, goal, checkpoint };
  }

  private async persistUpdate(input: {
    goal: LearningGoalAggregate;
    before: LearningCheckpointRecord;
    after: LearningCheckpointRecord;
    action: string;
    reason: string;
    context: GrowthMutationContext;
  }): Promise<LearningCheckpointMutationResult> {
    const result = await this.checkpointRepository.update({
      goal: input.goal,
      before: input.before,
      after: input.after,
      event: {
        id: this.ids.next("checkpoint_event"),
        aggregateType: "learning_checkpoint",
        aggregateId: input.before.id,
        sequence: input.before.version + 1,
        action: input.action,
        before: input.before,
        after: input.after,
        reason: input.reason,
        actorId: input.context.actorId,
        occurredAt: input.after.updatedAt,
        correlationId: input.context.correlationId,
        idempotencyKey: input.context.idempotencyKey,
      },
      context: input.context,
    });
    if (result.kind === "conflict") return { ok: false, code: "CONFLICT" };
    return {
      ok: true,
      checkpoint: result.value,
      replayed: result.kind === "idempotent",
    };
  }
}
