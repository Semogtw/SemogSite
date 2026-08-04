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
  | "CHECKPOINT_WEIGHT_MUST_BE_FINITE"
  | "CHECKPOINT_WEIGHT_MUST_BE_INTEGER"
  | "CHECKPOINT_WEIGHT_OUT_OF_RANGE"
  | "CHECKPOINT_COMPLETION_MODE_INVALID"
  | "CHECKPOINT_NUMERIC_UNIT_REQUIRED"
  | "CHECKPOINT_NUMERIC_UNIT_TOO_LONG"
  | "CHECKPOINT_NUMERIC_TARGET_MUST_BE_FINITE"
  | "CHECKPOINT_NUMERIC_TARGET_MUST_BE_POSITIVE"
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

const VALIDATION_ERROR_CODES = new Set<LearningCheckpointValidationError>([
  "CHECKPOINT_TITLE_REQUIRED",
  "CHECKPOINT_TITLE_TOO_LONG",
  "CHECKPOINT_DESCRIPTION_TOO_LONG",
  "CHECKPOINT_DUE_DATE_INVALID",
  "CHECKPOINT_WEIGHT_MUST_BE_FINITE",
  "CHECKPOINT_WEIGHT_MUST_BE_INTEGER",
  "CHECKPOINT_WEIGHT_OUT_OF_RANGE",
  "CHECKPOINT_COMPLETION_MODE_INVALID",
  "CHECKPOINT_NUMERIC_UNIT_REQUIRED",
  "CHECKPOINT_NUMERIC_UNIT_TOO_LONG",
  "CHECKPOINT_NUMERIC_TARGET_MUST_BE_FINITE",
  "CHECKPOINT_NUMERIC_TARGET_MUST_BE_POSITIVE",
]);

function validationFailure(
  errors: readonly LearningCheckpointValidationError[],
): LearningCheckpointMutationResult {
  return { ok: false, code: "VALIDATION_FAILED", errors };
}

function reorderValidationFailure(
  errors: readonly LearningCheckpointValidationError[],
): LearningCheckpointReorderResult {
  return { ok: false, code: "VALIDATION_FAILED", errors };
}

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

function normalizeDate(value: string | null): string | null {
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

function mapValidationException(
  error: unknown,
): LearningCheckpointValidationError | null {
  if (!(error instanceof Error)) return null;
  const code = error.message as LearningCheckpointValidationError;
  return VALIDATION_ERROR_CODES.has(code) ? code : null;
}

function normalizeReason(value: string): {
  value: string;
  errors: readonly LearningCheckpointValidationError[];
} {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return { value: normalized, errors: ["REASON_REQUIRED"] };
  }
  if (normalized.length > 500) {
    return { value: normalized, errors: ["REASON_TOO_LONG"] };
  }
  return { value: normalized, errors: [] };
}

function isPositiveVersion(value: number): boolean {
  return Number.isInteger(value) && value >= 1;
}

function isGoalEditable(goal: LearningGoalAggregate): boolean {
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
  return (
    goal.checkpoints.find((checkpoint) => checkpoint.id === checkpointId) ??
    null
  );
}

function nextCheckpointStatus(input: {
  checkpoint: LearningCheckpointRecord;
  action: LearningCheckpointTransitionAction;
}): LearningCheckpointStatus | null {
  const { checkpoint, action } = input;
  if (action === "start") {
    return checkpoint.status === "pending" ? "in_progress" : null;
  }
  if (action === "waive") {
    return checkpoint.status === "pending" || checkpoint.status === "in_progress"
      ? "waived"
      : null;
  }
  if (action === "cancel") {
    return checkpoint.status === "pending" || checkpoint.status === "in_progress"
      ? "cancelled"
      : null;
  }
  if (
    checkpoint.status !== "pending" &&
    checkpoint.status !== "in_progress"
  ) {
    return null;
  }
  if (
    checkpoint.completionMode.kind === "numeric" &&
    (checkpoint.acceptedValue === null ||
      checkpoint.acceptedValue < checkpoint.completionMode.target)
  ) {
    return null;
  }
  return "completed";
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
    if (!isPositiveVersion(input.expectedGoalVersion)) {
      errors.push("EXPECTED_VERSION_INVALID");
    }
    if (errors.length > 0) return validationFailure(errors);

    try {
      const title = normalizeTitle(input.title);
      const description = normalizeDescription(input.description);
      const weight = normalizeCheckpointWeight(input.weight);
      const completionMode = validateCompletionMode(input.completionMode);
      const dueDate = normalizeDate(input.dueDate);
      const goal = await this.goalRepository.getById(context.ownerId, goalId);
      if (goal === null) return { ok: false, code: "GOAL_NOT_FOUND" };
      if (goal.version !== input.expectedGoalVersion) {
        return { ok: false, code: "CONFLICT" };
      }
      if (!isGoalEditable(goal)) {
        return { ok: false, code: "GOAL_NOT_EDITABLE" };
      }

      const now = validateIsoTimestamp(this.clock.now());
      const checkpoint: LearningCheckpointRecord = {
        id: this.ids.next("checkpoint"),
        goalId: goal.id,
        title,
        description,
        status: "pending",
        required: input.required,
        sequence:
          goal.checkpoints.reduce(
            (maximum, current) => Math.max(maximum, current.sequence),
            0,
          ) + 1,
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
      const validationError = mapValidationException(error);
      if (validationError !== null) {
        return validationFailure([validationError]);
      }
      throw error;
    }
  }

  async recordAcceptedValue(
    input: RecordLearningCheckpointValueInput,
    context: GrowthMutationContext,
  ): Promise<LearningCheckpointMutationResult> {
    const target = this.validateTarget({
      goalId: input.goalId,
      checkpointId: input.checkpointId,
      expectedVersion: input.expectedCheckpointVersion,
      reason: input.reason,
      confirmed: true,
      confirmationRequired: false,
    });
    if (!target.ok) return target.result;
    if (!Number.isFinite(input.acceptedValue)) {
      return validationFailure([
        "CHECKPOINT_ACCEPTED_VALUE_MUST_BE_FINITE",
      ]);
    }
    if (input.acceptedValue < 0) {
      return validationFailure(["CHECKPOINT_ACCEPTED_VALUE_NEGATIVE"]);
    }

    const loaded = await this.loadCheckpoint({
      ownerId: context.ownerId,
      goalId: target.goalId,
      checkpointId: target.checkpointId,
      expectedVersion: input.expectedCheckpointVersion,
    });
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

    const now = validateIsoTimestamp(this.clock.now());
    const after: LearningCheckpointRecord = {
      ...loaded.checkpoint,
      acceptedValue: input.acceptedValue,
      status:
        input.acceptedValue >= loaded.checkpoint.completionMode.target
          ? "completed"
          : "in_progress",
      updatedAt: now,
      version: loaded.checkpoint.version + 1,
    };
    return this.persistUpdate({
      goal: loaded.goal,
      before: loaded.checkpoint,
      after,
      action: "learning_checkpoint.record_value",
      reason: target.reason,
      context,
    });
  }

  async transition(
    input: TransitionLearningCheckpointInput,
    context: GrowthMutationContext,
  ): Promise<LearningCheckpointMutationResult> {
    const target = this.validateTarget({
      goalId: input.goalId,
      checkpointId: input.checkpointId,
      expectedVersion: input.expectedCheckpointVersion,
      reason: input.reason,
      confirmed: input.confirmed,
      confirmationRequired:
        input.action === "waive" || input.action === "cancel",
    });
    if (!target.ok) return target.result;

    const loaded = await this.loadCheckpoint({
      ownerId: context.ownerId,
      goalId: target.goalId,
      checkpointId: target.checkpointId,
      expectedVersion: input.expectedCheckpointVersion,
    });
    if (!loaded.ok) return loaded.result;

    const status = nextCheckpointStatus({
      checkpoint: loaded.checkpoint,
      action: input.action,
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

    const after: LearningCheckpointRecord = {
      ...loaded.checkpoint,
      status,
      updatedAt: validateIsoTimestamp(this.clock.now()),
      version: loaded.checkpoint.version + 1,
    };
    return this.persistUpdate({
      goal: loaded.goal,
      before: loaded.checkpoint,
      after,
      action: `learning_checkpoint.${input.action}`,
      reason: target.reason,
      context,
    });
  }

  async reorder(
    input: ReorderLearningCheckpointsInput,
    context: GrowthMutationContext,
  ): Promise<LearningCheckpointReorderResult> {
    const goalId = input.goalId.trim();
    const reason = normalizeReason(input.reason);
    const orderedIds = input.orderedCheckpointIds.map((id) => id.trim());
    const errors: LearningCheckpointValidationError[] = [];
    if (goalId.length === 0) errors.push("GOAL_ID_REQUIRED");
    if (!isPositiveVersion(input.expectedGoalVersion)) {
      errors.push("EXPECTED_VERSION_INVALID");
    }
    if (orderedIds.length === 0) errors.push("CHECKPOINT_ORDER_REQUIRED");
    if (
      orderedIds.some((id) => id.length === 0) ||
      new Set(orderedIds).size !== orderedIds.length
    ) {
      errors.push("CHECKPOINT_ORDER_DUPLICATE");
    }
    errors.push(...reason.errors);
    if (errors.length > 0) return reorderValidationFailure(errors);

    const goal = await this.goalRepository.getById(context.ownerId, goalId);
    if (goal === null) return { ok: false, code: "GOAL_NOT_FOUND" };
    if (goal.version !== input.expectedGoalVersion) {
      return { ok: false, code: "CONFLICT" };
    }
    if (!isGoalEditable(goal)) {
      return { ok: false, code: "GOAL_NOT_EDITABLE" };
    }

    const checkpointsById = new Map(
      goal.checkpoints.map((checkpoint) => [checkpoint.id, checkpoint]),
    );
    if (
      checkpointsById.size !== orderedIds.length ||
      orderedIds.some((id) => !checkpointsById.has(id))
    ) {
      return { ok: false, code: "CHECKPOINT_ORDER_MISMATCH" };
    }

    const now = validateIsoTimestamp(this.clock.now());
    const after = orderedIds.map((id, index) => {
      const checkpoint = checkpointsById.get(id);
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
        reason: reason.value,
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

  private validateTarget(input: {
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
    const reason = normalizeReason(input.reason);
    const errors: LearningCheckpointValidationError[] = [];
    if (goalId.length === 0) errors.push("GOAL_ID_REQUIRED");
    if (checkpointId.length === 0) errors.push("CHECKPOINT_ID_REQUIRED");
    if (!isPositiveVersion(input.expectedVersion)) {
      errors.push("EXPECTED_VERSION_INVALID");
    }
    errors.push(...reason.errors);
    if (input.confirmationRequired && !input.confirmed) {
      errors.push("CONFIRMATION_REQUIRED");
    }
    if (errors.length > 0) {
      return { ok: false, result: validationFailure(errors) };
    }
    return {
      ok: true,
      goalId,
      checkpointId,
      reason: reason.value,
    };
  }

  private async loadCheckpoint(input: {
    ownerId: string;
    goalId: string;
    checkpointId: string;
    expectedVersion: number;
  }): Promise<
    | {
        ok: true;
        goal: LearningGoalAggregate;
        checkpoint: LearningCheckpointRecord;
      }
    | { ok: false; result: LearningCheckpointMutationResult }
  > {
    const goal = await this.goalRepository.getById(
      input.ownerId,
      input.goalId,
    );
    if (goal === null) {
      return { ok: false, result: { ok: false, code: "GOAL_NOT_FOUND" } };
    }
    if (!isGoalEditable(goal)) {
      return { ok: false, result: { ok: false, code: "GOAL_NOT_EDITABLE" } };
    }
    const checkpoint = findCheckpoint(goal, input.checkpointId);
    if (checkpoint === null) {
      return {
        ok: false,
        result: { ok: false, code: "CHECKPOINT_NOT_FOUND" },
      };
    }
    if (checkpoint.version !== input.expectedVersion) {
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
