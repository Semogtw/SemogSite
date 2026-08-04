import type {
  LearningGoalTemplateId,
  MaterializedLearningGoalTemplate,
  QuickLearningGoalServiceResult,
} from "@semogtw/domain/growth";
import type { GrowthOverviewRead } from "@semogtw/database/growth";
import type {
  GrowthQuickCreateSubmitInput,
  GrowthQuickCreateSubmitResult,
} from "../components/devos/growth-quick-create";

export type DevOSGrowthControllerDependencies = {
  getOverview(): Promise<
    | { ok: true; overview: GrowthOverviewRead }
    | { ok: false; code: "UNAUTHORIZED" | "READ_FAILED" }
  >;
  previewTemplate(
    templateId: LearningGoalTemplateId,
  ): Promise<
    | { ok: true; template: MaterializedLearningGoalTemplate }
    | { ok: false; code: "UNAUTHORIZED" | "TEMPLATE_NOT_FOUND" }
  >;
  quickCreate(
    input: GrowthQuickCreateSubmitInput,
  ): Promise<
    | QuickLearningGoalServiceResult
    | {
        ok: false;
        code:
          | "UNAUTHORIZED"
          | "CSRF_INVALID"
          | "VALIDATION_FAILED"
          | "WRITE_FAILED";
        error?: string;
      }
  >;
  invalidate(): Promise<void>;
};

export function createDevOSGrowthController(
  dependencies: DevOSGrowthControllerDependencies,
) {
  return {
    async load(): Promise<{ overview: GrowthOverviewRead }> {
      const result = await dependencies.getOverview();
      if (result.ok) return { overview: result.overview };
      throw new Error(
        result.code === "UNAUTHORIZED"
          ? "GROWTH_ROUTE_UNAUTHORIZED"
          : "GROWTH_ROUTE_READ_FAILED",
      );
    },

    async previewTemplate(
      templateId: LearningGoalTemplateId,
    ): Promise<MaterializedLearningGoalTemplate> {
      const result = await dependencies.previewTemplate(templateId);
      if (result.ok) return result.template;
      throw new Error(
        result.code === "UNAUTHORIZED"
          ? "GROWTH_ROUTE_UNAUTHORIZED"
          : "GROWTH_TEMPLATE_NOT_FOUND",
      );
    },

    async quickCreate(
      input: GrowthQuickCreateSubmitInput,
    ): Promise<GrowthQuickCreateSubmitResult> {
      const result = await dependencies.quickCreate(input);
      if (!result.ok) return result;
      await dependencies.invalidate();
      return {
        ok: true,
        goalId: result.goal.id,
        replayed: result.replayed,
      };
    },
  } as const;
}
