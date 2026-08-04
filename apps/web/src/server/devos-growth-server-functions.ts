import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { DevOSGrowthHandlers } from "./devos-growth-handlers";

const LearningGoalTemplateIdSchema = z.enum([
  "learn_programming_language",
  "complete_course",
  "build_and_ship_project",
  "prepare_for_exam",
  "earn_credential",
]);

const DateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
    );
  }, "INVALID_DATE");

export const GetGrowthGoalRequestSchema = z
  .object({
    goalId: z.string().trim().min(1).max(200),
  })
  .strict();

export const PreviewLearningGoalTemplateRequestSchema = z
  .object({
    templateId: LearningGoalTemplateIdSchema,
  })
  .strict();

export const QuickCreateLearningGoalRequestSchema = z
  .object({
    csrfToken: z.string().trim().min(1).max(500),
    idempotencyKey: z.string().uuid(),
    title: z.string().trim().min(1).max(160),
    targetDate: DateOnlySchema.nullable(),
    motivation: z.string().trim().max(1_000).nullable(),
    templateId: LearningGoalTemplateIdSchema.nullable(),
  })
  .strict();

export function createDevOSGrowthServerFunctions(
  handlers: DevOSGrowthHandlers,
) {
  const getGrowthOverviewFn = createServerFn({ method: "GET" }).handler(
    async () => handlers.getOverview(),
  );

  const getGrowthGoalFn = createServerFn({ method: "GET" })
    .validator(GetGrowthGoalRequestSchema)
    .handler(async ({ data }) => handlers.getGoal(data));

  const previewLearningGoalTemplateFn = createServerFn({ method: "GET" })
    .validator(PreviewLearningGoalTemplateRequestSchema)
    .handler(async ({ data }) => handlers.previewTemplate(data));

  const quickCreateLearningGoalFn = createServerFn({ method: "POST" })
    .validator(QuickCreateLearningGoalRequestSchema)
    .handler(async ({ data }) => handlers.quickCreate(data));

  return {
    getGrowthOverviewFn,
    getGrowthGoalFn,
    previewLearningGoalTemplateFn,
    quickCreateLearningGoalFn,
  } as const;
}
