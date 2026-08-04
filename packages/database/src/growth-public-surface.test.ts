import { describe, expect, it } from "vitest";
import {
  SqliteGrowthReadModel,
  SqliteQuickLearningGoalRepository,
} from "./growth";

describe("Growth database public surface", () => {
  it("exports the read model and atomic quick-create repository", () => {
    expect(SqliteGrowthReadModel).toBeTypeOf("function");
    expect(SqliteQuickLearningGoalRepository).toBeTypeOf("function");
  });
});
