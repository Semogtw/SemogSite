import { describe, expect, it } from "vitest";
import {
  listLearningGoalTemplates,
  materializeLearningGoalTemplate,
} from "./goal-templates";

describe("learning goal templates", () => {
  it("exposes a stable ordered version-one catalog", () => {
    expect(listLearningGoalTemplates().map((template) => template.id)).toEqual([
      "learn_programming_language",
      "complete_course",
      "build_and_ship_project",
      "prepare_for_exam",
      "earn_credential",
    ]);
    expect(
      listLearningGoalTemplates().every((template) => template.version === 1),
    ).toBe(true);
  });

  it("materializes the programming template with five exact checkpoints", () => {
    const materialized = materializeLearningGoalTemplate(
      "learn_programming_language",
    );

    expect(materialized.origin).toEqual({
      kind: "template",
      templateId: "learn_programming_language",
      templateVersion: 1,
    });
    expect(materialized.checkpoints.map((checkpoint) => checkpoint.title)).toEqual([
      "Fundamentos",
      "Prática guiada",
      "Bibliotecas e ferramentas",
      "Projeto aplicado",
      "Revisão e evidência final",
    ]);
    expect(materialized.checkpoints.map((checkpoint) => checkpoint.weight)).toEqual([
      20, 20, 20, 20, 20,
    ]);
    expect(
      materialized.checkpoints.reduce(
        (total, checkpoint) => total + checkpoint.weight,
        0,
      ),
    ).toBe(100);
    expect(
      materialized.checkpoints.every(
        (checkpoint) =>
          checkpoint.weightMode === "automatic" &&
          checkpoint.completionMode.kind === "binary" &&
          checkpoint.required,
      ),
    ).toBe(true);
  });

  it("returns deterministic independent copies", () => {
    const first = materializeLearningGoalTemplate("complete_course");
    const second = materializeLearningGoalTemplate("complete_course");

    expect(first).toEqual(second);
    expect(first).not.toBe(second);
    expect(first.checkpoints).not.toBe(second.checkpoints);
    expect(first.checkpoints[0]).not.toBe(second.checkpoints[0]);
  });

  it("uses unique stable checkpoint keys in every template", () => {
    for (const template of listLearningGoalTemplates()) {
      const keys = template.checkpoints.map((checkpoint) => checkpoint.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys).toHaveLength(5);
    }
  });

  it("rejects an unknown template ID", () => {
    expect(() =>
      materializeLearningGoalTemplate(
        "unknown" as "learn_programming_language",
      ),
    ).toThrow("LEARNING_GOAL_TEMPLATE_NOT_FOUND");
  });
});
