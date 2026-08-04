import type { Priority } from "../shared/types";
import type {
  LearningGoalAggregate,
  LearningGoalRecord,
  LearningGoalStatus,
} from "./model";
import type {
  GrowthClock,
  GrowthIdGenerator,
  GrowthMutationContext,
  LearningGoalRepository,
} from "./ports";
import { deriveGoalProgress } from "./progress";
import {
  normalizeLearningGoalSlug,
  normalizeLearningGoalTitle,
  validateIsoTimestamp,
} from "./validation";

export type CreateLearningGoalInput = {
  title: string;
  slug: string | null;
  description: string;
  motivation: string | null;
  priority: Priority;
  targetDate: string | null;
};

export type LearningGoalTransitionAction =
  | "activate"
  | "pause"
  | "resume"
  | "complete"
  | "cancel"
  | "archive";

export type TransitionLearningGoalInput = {
  goalId: string;
  expectedVersion: number;
  action: LearningGoalTransitionAction;
  reason: string;
  confirmed: boolean;
};

export type LearningGoalValidationError =
  | "LEARNING_GOAL_TITLE_REQUIRED"
  | "LEARNING_GOAL_TITLE_TOO_LONG"
  | "LEARNING_GOAL_SLUG_REQUIRED"
  | "LEARNING_GOAL_SLUG_TOO_LONG"
  | "ISO_TIMESTAMP_INVALID"
  | "GOAL_ID_REQUIRED"
  | "EXPECTED_VERSION_INVALID"
  | "DESCRIPTION_TOO_LONG"
  | "MOTIVATION_TOO_LONG"
  | "PRIORITY_INVALID"
  | "TARGET_DATE_INVALID"
  | "REASON_REQUIRED"
  | "REASON_TOO_LONG"
  | "CONFIRMATION_REQUIRED";

export type LearningGoalServiceResult =
  | {
      ok: true;
      goal: LearningGoalAggregate;
      replayed: boolean;
    }
  | {
      ok: false;
      code: "VALIDATION_FAILED";
      errors: readonly LearningGoalValidationError[];
    }
  | {
      ok: false;
      code:
        | "NOT_FOUND"
        | "CONFLICT"
        | "INVALID_TRANSITION"
        | "PROGRESS_NOT_MEASURABLE"
        | "PROGRESS_NOT_COMPLETE"
        | "REQUIRED_CHECKPOINTS_INCOMPLETE";
    };

const PRIORITIES = new Set<Priority>([
  "critical",
  "high",
  "medium",
  "low",
]);

const EXCEPTION_VALIDATION_ERRORS = new Set<LearningGoalValidationError>([
  "LEARNING_GOAL_TITLE_REQUIRED",
  "LEARNING_GOAL_TITLE_TOO_LONG",
  "LEARNING_GOAL_SLUG_REQUIRED",
  "LEARNING_GOAL_SLUG_TOO_LONG",
  "ISO_TIMESTAMP_INVALID",
  "DESCRIPTION_TOO_LONG",
  "MOTIVATION_TOO_LONG",
  "TARGET_DATE_INVALID",
]);

function normalizeOptionalText(
  value: string | null,
  maximumLength: number,
  error: LearningGoalValidationError,
): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > maximumLength) throw new Error(error);
  return normalized;
}

function normalizeDescription(value: string): string {
  const normalized = value.trim();
  if (normalized.length > 5_000) {
    throw new Error("DESCRIPTION_TOO_LONG");
  }
  return normalized;
}

function validateTargetDate(value: string | null): string | null {
  if (value === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("TARGET_DATE_INVALID");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("TARGET_DATE_INVALID");
  }
  return value;
}

function eventAction(action: LearningGoalTransitionAction): string {
  return `learning_goal.${action}`;
}

function nextStatus(
  current: LearningGoalStatus,
  action: LearningGoalTransitionAction,
): LearningGoalStatus | null {
  switch (action) {
    case "activate":
      return current === "draft" ? "active" : null;
    case "pause":
      return current === "active" ? "paused" : null;
    case "resume":
      return current === "paused" ? "active" : null;
    case "complete":
      return current === "active" || current === "paused" ? "completed" : null;
    case "cancel":
      return current === "draft" || current === "active" || current === "paused"
        ? "cancelled"
        : null;
    case "archive":
      return current === "completed" || current === "cancelled"
        ? "archived"
        : null;
  }
}

function validationErrorFromException(
  error: unknown,
): LearningGoalValidationError | null {
  if (!(error instanceof Error)) return null;
  const code = error.message as LearningGoalValidationError;
  return EXCEPTION_VALIDATION_ERRORS.has(code) ? code : null;
}

function goalRecordFromAggregate(
  aggregate: LearningGoalAggregate,
): LearningGoalRecord {
  return {
    id: aggregate.id,
    ownerId: aggregate.ownerId,
    slug: aggregate.slug,
    title: aggregate.title,
    description: aggregate.description,
    motivation: aggregate.motivation,
    status: aggregate.status,
    priority: aggregate.priority,
    targetDate: aggregate.targetDate,
    createdAt: aggregate.createdAt,
    updatedAt: aggregate.updatedAt,
    version: aggregate.version,
  };
}

export class LearningGoalService {
  constructor(
    private readonly repository: LearningGoalRepository,
    private readonly clock: GrowthClock,
    private readonly ids: GrowthIdGenerator,
  ) {}

  async createDraft(
    input: CreateLearningGoalInput,
    context: GrowthMutationContext,
  ): Promise<LearningGoalServiceResult> {
    try {
      const now = validateIsoTimestamp(this.clock.now());
      const title = normalizeLearningGoalTitle(input.title);
      const slug = normalizeLearningGoalSlug(input.slug ?? title);
      const description = normalizeDescription(input.description);
      const motivation = normalizeOptionalText(
        input.motivation,
        1_000,
        "MOTIVATION_TOO_LONG",
      );
      if (!PRIORITIES.has(input.priority)) {
        return {
          ok: false,
          code: "VALIDATION_FAILED",
          errors: ["PRIORITY_INVALID"],
        };
      }
      const targetDate = validateTargetDate(input.targetDate);
      const goal: LearningGoalRecord = {
        id: this.ids.next("goal"),
        ownerId: context.ownerId,
        slug,
        title,
        description,
        motivation,
        status: "draft",
        priority: input.priority,
        targetDate,
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
      const result = await this.repository.create({
        goal,
        event: {
          id: this.ids.next("goal_event"),
          aggregateType: "learning_goal",
          aggregateId: goal.id,
          sequence: 1,
          action: "learning_goal.create_draft",
          before: null,
          after: goal,
          reason: "Create learning goal draft",
          actorId: context.actorId,
          occurredAt: now,
          correlationId: context.correlationId,
          idempotencyKey: context.idempotencyKey,
        },
        context,
      });

      if (result.kind === "conflict") {
        return { ok: false, code: "CONFLICT" };
      }
      return {
        ok: true,
        goal: result.value,
        replayed: result.kind === "idempotent",
      };
    } catch (error) {
      const validationError = validationErrorFromException(error);
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

  async transition(
    input: TransitionLearningGoalInput,
    context: GrowthMutationContext,
  ): Promise<LearningGoalServiceResult> {
    const goalId = input.goalId.trim();
    const reason = input.reason.trim();
    const errors: LearningGoalValidationError[] = [];
    if (goalId.length === 0) errors.push("GOAL_ID_REQUIRED");
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) {
      errors.push("EXPECTED_VERSION_INVALID");
    }
    if (reason.length === 0) errors.push("REASON_REQUIRED");
    else if (reason.length > 500) errors.push("REASON_TOO_LONG");
    if (
      (input.action === "cancel" || input.action === "archive") &&
      !input.confirmed
    ) {
      errors.push("CONFIRMATION_REQUIRED");
    }
    if (errors.length > 0) {
      return { ok: false, code: "VALIDATION_FAILED", errors };
    }

    const before = await this.repository.getById(context.ownerId, goalId);
    if (before === null) return { ok: false, code: "NOT_FOUND" };
    if (before.version !== input.expectedVersion) {
      return { ok: false, code: "CONFLICT" };
    }

    const status = nextStatus(before.status, input.action);
    if (status === null) return { ok: false, code: "INVALID_TRANSITION" };

    if (input.action === "complete") {
      const progress = deriveGoalProgress(
        before.checkpoints.map((checkpoint) => ({
          checkpointId: checkpoint.id,
          required: checkpoint.required,
          status: checkpoint.status,
          weight: checkpoint.weight,
          completionMode: checkpoint.completionMode,
          acceptedValue: checkpoint.acceptedValue,
        })),
      );
      if (!progress.measurable) {
        return { ok: false, code: "PROGRESS_NOT_MEASURABLE" };
      }
      if (progress.percent !== 100) {
        return { ok: false, code: "PROGRESS_NOT_COMPLETE" };
      }
      if (!progress.requiredCheckpointsComplete) {
        return { ok: false, code: "REQUIRED_CHECKPOINTS_INCOMPLETE" };
      }
    }

    const now = validateIsoTimestamp(this.clock.now());
    const after: LearningGoalAggregate = {
      ...before,
      status,
      updatedAt: now,
      version: before.version + 1,
    };
    const result = await this.repository.update({
      before,
      after,
      event: {
        id: this.ids.next("goal_event"),
        aggregateType: "learning_goal",
        aggregateId: before.id,
        sequence: before.version + 1,
        action: eventAction(input.action),
        before: goalRecordFromAggregate(before),
        after: goalRecordFromAggregate(after),
        reason,
        actorId: context.actorId,
        occurredAt: now,
        correlationId: context.correlationId,
        idempotencyKey: context.idempotencyKey,
      },
      context,
    });

    if (result.kind === "conflict") {
      return { ok: false, code: "CONFLICT" };
    }
    return {
      ok: true,
      goal: result.value,
      replayed: result.kind === "idempotent",
    };
  }
}
