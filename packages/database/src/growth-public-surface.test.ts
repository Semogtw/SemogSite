import { describe, expect, it } from "vitest";
import {
  SqliteCheckpointWeightRebalanceRepository,
  SqliteGrowthReadModel,
  SqliteQuickLearningGoalRepository,
} from "./growth";

describe("Growth database public surface", () => {
  it("exports read, quick-create and checkpoint rebalance adapters", () => {
    expect(SqliteGrowthReadModel).toBeTypeOf("function");
    expect(SqliteQuickLearningGoalRepository).toBeTypeOf("function");
    expect(SqliteCheckpointWeightRebalanceRepository).toBeTypeOf("function");
  });
});
