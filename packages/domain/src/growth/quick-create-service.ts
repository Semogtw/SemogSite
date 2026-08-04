import type {
  LearningCheckpointRecord,
  LearningGoalAggregate,
  LearningGoalRecord,
} from "./model";
import type {
  GrowthClock,
  GrowthDomainEvent,
  GrowthIdGenerator,
  GrowthMutationContext,
  GrowthWriteResult,
} from "./ports";
import {
  prepareQuickLearningGoalDraft,
  type QuickCreateLearningGoalInput,
} from "./quick-create";
import { validateIsoTimestamp } from "./validation";

export type QuickCreateAssistanceOrigin =
  | { kind: "manual" }
  | {
      kind: "template";
      templateId:
        | "learn_programming_language"
        | "complete_course"
        | "build_and_ship_project"
        | "prepare_for_exam"
        | "earn_credential";
      templateVersion: 1;
    };

export type QuickCreateLearningGoalPersistence = {
  goal: LearningGoalRecord;
  checkpoints: readonly LearningCheckpointRecord[];
  origin: QuickCreateAssistanceOrigin;
  goalEvent: GrowthDomainEvent<LearningGoalRecord | null, LearningGoalRecord>;
  checkpointEvents: readonly GrowthDomainEvent<
    LearningCheckpointRecord | null,
    LearningCheckpointRecord
  >[];
  context: GrowthMutationContext;
};

export interface QuickLearningGoalRepository {
  create(
    input: QuickCreateLearningGoalPersistence,
  ): Promise<GrowthWriteResult<LearningGoalAggregate>>;
}

export type QuickLearningGoalServiceResult =
  | { ok: true; goal: LearningGoalAggregate; replayed: boolean }
  | { ok: false; code: "CONFLICT" }
  | { ok: false; code: "VALIDATION_FAILED"; error: string };

const KNOWN_VALIDATION_ERRORS = new Set([
  "LEARNING_GOAL_TITLE_REQUIRED",
  "LEARNING_GOAL_TITLE_TOO_LONG",
  "LEARNING_GOAL_SLUG_REQUIRED",
  "LEARNING_GOAL_SLUG_TOO_LONG",
  "LEARNING_GOAL_TARGET_DATE_INVALID",
  "LEARNING_GOAL_MOTIVATION_TOO_LONG",
  "LEARNING_GOAL_TEMPLATE_NOT_FOUND",
  "ISO_TIMESTAMP_INVALID",
]);

export class QuickLearningGoalService {
  constructor(
    private readonly repository: QuickLearningGoalRepository,
    private readonly clock: GrowthClock,
    private readonly ids: GrowthIdGenerator,
  ) {}

  async create(
    input: QuickCreateLearningGoalInput,
    context: GrowthMutationContext,
  ): Promise<QuickLearningGoalServiceResult> {
    try {
      const prepared = prepareQuickLearningGoalDraft(input);
      const now = validateIsoTimestamp(this.clock.now());
      const goal: LearningGoalRecord = {
        id: this.ids.next("goal"),
        ownerId: context.ownerId,
        slug: prepared.goal.slug,
        title: prepared.goal.title,
        description: prepared.goal.description,
        motivation: prepared.goal.motivation,
        status: prepared.goal.status,
        priority: prepared.goal.priority,
        targetDate: prepared.goal.targetDate,
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
      const checkpoints = prepared.checkpoints.map(
        (checkpoint, index): LearningCheckpointRecord => ({
          id: this.ids.next("checkpoint"),
          goalId: goal.id,
          title: checkpoint.title,
          description: checkpoint.description,
          status: "pending",
          required: checkpoint.required,
          sequence: index + 1,
          weight: checkpoint.weight,
          completionMode: checkpoint.completionMode,
          acceptedValue: null,
          dueDate: null,
          createdAt: now,
          updatedAt: now,
          version: 1,
        }),
      );
      const reason =
        prepared.goal.origin.kind === "manual"
          ? "Create learning goal manually"
          : `Create learning goal from template ${prepared.goal.origin.templateId}@${prepared.goal.origin.templateVersion}`;
      const goalEvent: QuickCreateLearningGoalPersistence["goalEvent"] = {
        id: this.ids.next("goal_event"),
        aggregateType: "learning_goal",
        aggregateId: goal.id,
        sequence: 1,
        action: "learning_goal.quick_create",
        before: null,
        after: goal,
        reason,
        actorId: context.actorId,
        occurredAt: now,
        correlationId: context.correlationId,
        idempotencyKey: context.idempotencyKey,
      };
      const checkpointEvents = checkpoints.map(
        (
          checkpoint,
          index,
        ): QuickCreateLearningGoalPersistence["checkpointEvents"][number] => ({
          id: this.ids.next("checkpoint_event"),
          aggregateType: "learning_checkpoint",
          aggregateId: checkpoint.id,
          sequence: 1,
          action: "learning_checkpoint.template_add",
          before: null,
          after: checkpoint,
          reason: `${reason}; checkpoint ${index + 1}`,
          actorId: context.actorId,
          occurredAt: now,
          correlationId: context.correlationId,
          idempotencyKey: context.idempotencyKey,
        }),
      );
      const result = await this.repository.create({
        goal,
        checkpoints,
        origin: prepared.goal.origin,
        goalEvent,
        checkpointEvents,
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
      if (error instanceof Error && KNOWN_VALIDATION_ERRORS.has(error.message)) {
        return {
          ok: false,
          code: "VALIDATION_FAILED",
          error: error.message,
        };
      }
      throw error;
    }
  }
}
