import {
  DevOSReadService,
  OverviewService,
  ProjectService,
  RoadmapService,
  TodayService,
} from "@semogtw/domain";
import type { SqliteDatabase } from "../adapters/sqlite";
import { SqliteOverviewDataSource } from "../repositories/overview-data-source";
import { SqliteProjectDataSource } from "../repositories/project-data-source";
import { SqliteRoadmapDataSource } from "../repositories/roadmap-data-source";
import { SqliteTodayDataSource } from "../repositories/today-data-source";

export function createSqliteDevOSReadService(
  database: SqliteDatabase,
): DevOSReadService {
  return new DevOSReadService({
    overview: new OverviewService(new SqliteOverviewDataSource(database)),
    today: new TodayService(new SqliteTodayDataSource(database)),
    projects: new ProjectService(new SqliteProjectDataSource(database)),
    roadmap: new RoadmapService(new SqliteRoadmapDataSource(database)),
  });
}
