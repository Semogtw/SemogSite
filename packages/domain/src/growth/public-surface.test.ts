import { describe, expect, it } from "vitest";
import {
  QuickLearningGoalService,
  listLearningGoalTemplates,
  type QuickLearningGoalServiceResult,
} from "./index";

describe("Growth public package surface", () => {
  it("exports quick-create services and deterministic templates", () => {
    const result: QuickLearningGoalServiceResult = {
      ok: false,
      code: "CONFLICT",
    };

    expect(QuickLearningGoalService).toBeTypeOf("function");
    expect(listLearningGoalTemplates()).toHaveLength(5);
    expect(result).toEqual({ ok: false, code: "CONFLICT" });
  });
});
