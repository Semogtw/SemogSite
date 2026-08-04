import type { LearningGoalTemplateId } from "./goal-templates";
import { materializeLearningGoalTemplate } from "./goal-templates";
import { normalizeLearningGoalSlug, normalizeLearningGoalTitle } from "./validation";

export type QuickCreateLearningGoalInput = {
  title: string;
  targetDate: string | null;
  motivation: string | null;
  templateId: LearningGoalTemplateId | null;
};

export type QuickCreateLearningGoalDraft = {
  goal: {
    title: string;
    slug: string;
    description: "";
    motivation: string | null;
    priority: "medium";
    targetDate: string | null;
    status: "draft";
    origin:
      | { kind: "manual" }
      | {
          kind: "template";
          templateId: LearningGoalTemplateId;
          templateVersion: 1;
        };
  };
  checkpoints: readonly {
    key: string;
    title: string;
    description: string;
    required: boolean;
    completionMode: { kind: "binary" };
    weight: number;
    weightMode: "automatic";
    origin: {
      kind: "template";
      templateId: LearningGoalTemplateId;
      templateVersion: 1;
    };
  }[];
};

function normalizeMotivation(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > 1_000) {
    throw new Error("LEARNING_GOAL_MOTIVATION_TOO_LONG");
  }
  return normalized;
}

function normalizeTargetDate(value: string | null): string | null {
  if (value === null) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("LEARNING_GOAL_TARGET_DATE_INVALID");
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new Error("LEARNING_GOAL_TARGET_DATE_INVALID");
  }
  return value;
}

export function prepareQuickLearningGoalDraft(
  input: QuickCreateLearningGoalInput,
): QuickCreateLearningGoalDraft {
  const title = normalizeLearningGoalTitle(input.title);
  const targetDate = normalizeTargetDate(input.targetDate);
  const motivation = normalizeMotivation(input.motivation);

  if (input.templateId === null) {
    return {
      goal: {
        title,
        slug: normalizeLearningGoalSlug(title),
        description: "",
        motivation,
        priority: "medium",
        targetDate,
        status: "draft",
        origin: { kind: "manual" },
      },
      checkpoints: [],
    };
  }

  const materialized = materializeLearningGoalTemplate(input.templateId);
  return {
    goal: {
      title,
      slug: normalizeLearningGoalSlug(title),
      description: "",
      motivation,
      priority: "medium",
      targetDate,
      status: "draft",
      origin: materialized.origin,
    },
    checkpoints: materialized.checkpoints.map((checkpoint) => ({
      key: checkpoint.key,
      title: checkpoint.title,
      description: checkpoint.description,
      required: checkpoint.required,
      completionMode: { kind: "binary" },
      weight: checkpoint.weight,
      weightMode: checkpoint.weightMode,
      origin: materialized.origin,
    })),
  };
}
