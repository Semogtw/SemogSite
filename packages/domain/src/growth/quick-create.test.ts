import { describe, expect, it } from "vitest";
import { prepareQuickLearningGoalDraft } from "./quick-create";

describe("prepareQuickLearningGoalDraft", () => {
  it("prepares a title-only manual draft without invented data", () => {
    expect(
      prepareQuickLearningGoalDraft({
        title: "  Aprender Python  ",
        targetDate: null,
        motivation: null,
        templateId: null,
      }),
    ).toEqual({
      goal: {
        title: "Aprender Python",
        slug: "aprender-python",
        description: "",
        motivation: null,
        priority: "medium",
        targetDate: null,
        status: "draft",
        origin: { kind: "manual" },
      },
      checkpoints: [],
    });
  });

  it("materializes a selected deterministic template", () => {
    const draft = prepareQuickLearningGoalDraft({
      title: "Aprender Python para automação",
      targetDate: "2026-12-31",
      motivation: " Criar ferramentas próprias ",
      templateId: "learn_programming_language",
    });

    expect(draft.goal).toMatchObject({
      title: "Aprender Python para automação",
      slug: "aprender-python-para-automacao",
      motivation: "Criar ferramentas próprias",
      targetDate: "2026-12-31",
      origin: {
        kind: "template",
        templateId: "learn_programming_language",
        templateVersion: 1,
      },
    });
    expect(draft.checkpoints).toHaveLength(5);
    expect(
      draft.checkpoints.reduce(
        (total, checkpoint) => total + checkpoint.weight,
        0,
      ),
    ).toBe(100);
    expect(
      draft.checkpoints.every(
        (checkpoint) => checkpoint.weightMode === "automatic",
      ),
    ).toBe(true);
  });

  it("normalizes empty motivation to null", () => {
    expect(
      prepareQuickLearningGoalDraft({
        title: "Meta",
        targetDate: null,
        motivation: "   ",
        templateId: null,
      }).goal.motivation,
    ).toBeNull();
  });

  it("rejects invalid titles, dates and overlong motivation", () => {
    expect(() =>
      prepareQuickLearningGoalDraft({
        title: " ",
        targetDate: null,
        motivation: null,
        templateId: null,
      }),
    ).toThrow("LEARNING_GOAL_TITLE_REQUIRED");
    expect(() =>
      prepareQuickLearningGoalDraft({
        title: "Meta",
        targetDate: "2026-02-30",
        motivation: null,
        templateId: null,
      }),
    ).toThrow("LEARNING_GOAL_TARGET_DATE_INVALID");
    expect(() =>
      prepareQuickLearningGoalDraft({
        title: "Meta",
        targetDate: null,
        motivation: "a".repeat(1001),
        templateId: null,
      }),
    ).toThrow("LEARNING_GOAL_MOTIVATION_TOO_LONG");
  });
});
