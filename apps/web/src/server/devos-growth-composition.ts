import { QuickLearningGoalService } from "@semogtw/domain/growth";
import {
  SqliteGrowthReadModel,
  SqliteQuickLearningGoalRepository,
} from "@semogtw/database/growth";
import {
  createDevOSGrowthHandlers,
  type DevOSGrowthHandlers,
} from "./devos-growth-handlers";

export type DevOSGrowthSessionOwner = {
  id: string;
  sessionId: string;
};

type GrowthDatabase = ConstructorParameters<typeof SqliteGrowthReadModel>[0];

export type DevOSGrowthCompositionDependencies = {
  getDatabase(): Promise<GrowthDatabase | null>;
  resolveOwner(): Promise<DevOSGrowthSessionOwner | null>;
  authorizeMutation(
    csrfToken: string,
  ): Promise<DevOSGrowthSessionOwner | null>;
  now(): string;
  nextId(prefix: string): string;
  nextCorrelationId(): string;
};

export function createDevOSGrowthComposition(
  dependencies: DevOSGrowthCompositionDependencies,
): DevOSGrowthHandlers {
  async function requireDatabase(): Promise<GrowthDatabase> {
    const database = await dependencies.getDatabase();
    if (database === null) {
      throw new Error("GROWTH_STORAGE_UNAVAILABLE");
    }
    return database;
  }

  return createDevOSGrowthHandlers({
    async resolveOwner() {
      const owner = await dependencies.resolveOwner();
      return owner === null
        ? null
        : {
            ownerId: owner.id,
            actorId: owner.id,
            sessionId: owner.sessionId,
          };
    },
    async verifyCsrfToken(value) {
      return (await dependencies.authorizeMutation(value)) !== null;
    },
    async getOverview(ownerId) {
      const database = await requireDatabase();
      return new SqliteGrowthReadModel(database, dependencies.now).getOverview({
        ownerId,
      });
    },
    async getGoal(ownerId, goalId) {
      const database = await requireDatabase();
      return new SqliteGrowthReadModel(database, dependencies.now).getGoal({
        ownerId,
        goalId,
      });
    },
    async createQuickGoal(input, context) {
      const database = await requireDatabase();
      const service = new QuickLearningGoalService(
        new SqliteQuickLearningGoalRepository(database),
        { now: dependencies.now },
        { next: dependencies.nextId },
      );
      return service.create(input, context);
    },
    now: dependencies.now,
    nextCorrelationId: dependencies.nextCorrelationId,
  });
}
