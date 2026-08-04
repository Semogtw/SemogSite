import {
  materializeLearningGoalTemplate,
  type GrowthMutationContext,
  type LearningGoalTemplateId,
  type QuickCreateLearningGoalInput,
  type QuickLearningGoalServiceResult,
} from "@semogtw/domain/growth";
import type {
  GrowthOverviewRead,
  LearningGoalDetailRead,
} from "@semogtw/database/growth";

export type DevOSGrowthOwner = {
  ownerId: string;
  actorId: string;
  sessionId: string;
};

export type DevOSGrowthDependencies = {
  resolveOwner(): Promise<DevOSGrowthOwner | null>;
  verifyCsrfToken(value: string): Promise<boolean>;
  getOverview(ownerId: string): Promise<GrowthOverviewRead>;
  getGoal(
    ownerId: string,
    goalId: string,
  ): Promise<LearningGoalDetailRead | null>;
  createQuickGoal(
    input: QuickCreateLearningGoalInput,
    context: GrowthMutationContext,
  ): Promise<QuickLearningGoalServiceResult>;
  now(): string;
  nextCorrelationId(): string;
};

export type QuickCreateLearningGoalRequest = QuickCreateLearningGoalInput & {
  csrfToken: string;
  idempotencyKey: string;
};

export type DevOSGrowthHandlers = {
  getOverview(): Promise<
    | { ok: true; overview: GrowthOverviewRead }
    | { ok: false; code: "UNAUTHORIZED" | "READ_FAILED" }
  >;
  getGoal(input: { goalId: string }): Promise<
    | { ok: true; goal: LearningGoalDetailRead }
    | {
        ok: false;
        code: "UNAUTHORIZED" | "NOT_FOUND" | "VALIDATION_FAILED" | "READ_FAILED";
        error?: string;
      }
  >;
  previewTemplate(input: { templateId: LearningGoalTemplateId }): Promise<
    | {
        ok: true;
        template: ReturnType<typeof materializeLearningGoalTemplate>;
      }
    | { ok: false; code: "UNAUTHORIZED" | "TEMPLATE_NOT_FOUND" }
  >;
  quickCreate(input: QuickCreateLearningGoalRequest): Promise<
    | Extract<QuickLearningGoalServiceResult, { ok: true }>
    | Extract<QuickLearningGoalServiceResult, { ok: false }>
    | {
        ok: false;
        code: "UNAUTHORIZED" | "CSRF_INVALID" | "VALIDATION_FAILED" | "WRITE_FAILED";
        error?: string;
      }
  >;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateGoalId(value: string): string | null {
  const normalized = value.trim();
  return normalized.length >= 1 && normalized.length <= 200
    ? normalized
    : null;
}

function validateQuickCreateRequest(
  input: QuickCreateLearningGoalRequest,
): string | null {
  if (!UUID_PATTERN.test(input.idempotencyKey)) {
    return "IDEMPOTENCY_KEY_INVALID";
  }
  if (input.csrfToken.trim().length === 0 || input.csrfToken.length > 500) {
    return "CSRF_TOKEN_INVALID";
  }
  if (input.title.length > 160) return "LEARNING_GOAL_TITLE_TOO_LONG";
  if (input.motivation !== null && input.motivation.length > 1_000) {
    return "LEARNING_GOAL_MOTIVATION_TOO_LONG";
  }
  return null;
}

export function createDevOSGrowthHandlers(
  dependencies: DevOSGrowthDependencies,
): DevOSGrowthHandlers {
  return {
    async getOverview() {
      const owner = await dependencies.resolveOwner();
      if (owner === null) return { ok: false, code: "UNAUTHORIZED" };
      try {
        return {
          ok: true,
          overview: await dependencies.getOverview(owner.ownerId),
        };
      } catch {
        return { ok: false, code: "READ_FAILED" };
      }
    },

    async getGoal(input) {
      const owner = await dependencies.resolveOwner();
      if (owner === null) return { ok: false, code: "UNAUTHORIZED" };
      const goalId = validateGoalId(input.goalId);
      if (goalId === null) {
        return {
          ok: false,
          code: "VALIDATION_FAILED",
          error: "GROWTH_GOAL_ID_INVALID",
        };
      }
      try {
        const goal = await dependencies.getGoal(owner.ownerId, goalId);
        return goal === null
          ? { ok: false, code: "NOT_FOUND" }
          : { ok: true, goal };
      } catch {
        return { ok: false, code: "READ_FAILED" };
      }
    },

    async previewTemplate(input) {
      const owner = await dependencies.resolveOwner();
      if (owner === null) return { ok: false, code: "UNAUTHORIZED" };
      try {
        return {
          ok: true,
          template: materializeLearningGoalTemplate(input.templateId),
        };
      } catch (error) {
        if (
          error instanceof Error &&
          error.message === "LEARNING_GOAL_TEMPLATE_NOT_FOUND"
        ) {
          return { ok: false, code: "TEMPLATE_NOT_FOUND" };
        }
        throw error;
      }
    },

    async quickCreate(input) {
      const owner = await dependencies.resolveOwner();
      if (owner === null) return { ok: false, code: "UNAUTHORIZED" };

      const validationError = validateQuickCreateRequest(input);
      if (validationError !== null) {
        return {
          ok: false,
          code: "VALIDATION_FAILED",
          error: validationError,
        };
      }
      if (!(await dependencies.verifyCsrfToken(input.csrfToken))) {
        return { ok: false, code: "CSRF_INVALID" };
      }

      try {
        return await dependencies.createQuickGoal(
          {
            title: input.title,
            targetDate: input.targetDate,
            motivation: input.motivation,
            templateId: input.templateId,
          },
          {
            ownerId: owner.ownerId,
            actorId: owner.actorId,
            correlationId: dependencies.nextCorrelationId(),
            idempotencyKey: input.idempotencyKey,
          },
        );
      } catch {
        return { ok: false, code: "WRITE_FAILED" };
      }
    },
  };
}
