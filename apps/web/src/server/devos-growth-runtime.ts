import { QuickLearningGoalService } from "@semogtw/domain/growth";
import {
  SqliteGrowthReadModel,
  SqliteQuickLearningGoalRepository,
} from "@semogtw/database/growth";
import {
  createDevOSGrowthHandlers,
  type DevOSGrowthOwner,
} from "./devos-growth-handlers";

export type DevOSGrowthRuntimeInput = {
  database: ConstructorParameters<typeof SqliteGrowthReadModel>[0];
  resolveOwner(): Promise<DevOSGrowthOwner | null>;
  verifyCsrfToken(value: string): Promise<boolean>;
  now(): string;
  nextId(prefix: string): string;
  nextCorrelationId(): string;
};

export function createDevOSGrowthRuntime(input: DevOSGrowthRuntimeInput) {
  const readModel = new SqliteGrowthReadModel(input.database, input.now);
  const quickCreateService = new QuickLearningGoalService(
    new SqliteQuickLearningGoalRepository(input.database),
    { now: input.now },
    { next: input.nextId },
  );
  const handlers = createDevOSGrowthHandlers({
    resolveOwner: input.resolveOwner,
    verifyCsrfToken: input.verifyCsrfToken,
    getOverview: (ownerId) => readModel.getOverview({ ownerId }),
    getGoal: (ownerId, goalId) => readModel.getGoal({ ownerId, goalId }),
    createQuickGoal: (value, context) =>
      quickCreateService.create(value, context),
    now: input.now,
    nextCorrelationId: input.nextCorrelationId,
  });

  return {
    handlers,
    readModel,
    quickCreateService,
  } as const;
}
