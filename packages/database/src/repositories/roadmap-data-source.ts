import type { RoadmapDataSource, RoadmapItem } from "@semogtw/domain";
import { asc, eq } from "drizzle-orm";
import type { SqliteDatabase } from "../adapters/sqlite";
import { projects } from "../schema/projects";
import { stages } from "../schema/roadmap";

export class SqliteRoadmapDataSource implements RoadmapDataSource {
  constructor(private readonly database: SqliteDatabase) {}

  async listRoadmapItems(): Promise<readonly RoadmapItem[]> {
    return this.database
      .select({
        id: stages.id,
        projectId: projects.id,
        projectName: projects.name,
        title: stages.title,
        area: stages.area,
        state: stages.state,
        progress: stages.progress,
        orderIndex: stages.orderIndex,
        currentPosition: stages.currentPosition,
        nextStep: stages.nextStep,
        blocker: stages.blocker,
        updatedAt: stages.updatedAt,
      })
      .from(stages)
      .innerJoin(projects, eq(stages.projectId, projects.id))
      .orderBy(asc(projects.name), asc(stages.orderIndex))
      .all();
  }
}
