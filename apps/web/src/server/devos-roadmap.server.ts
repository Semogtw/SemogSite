import {
  RoadmapService,
  type RoadmapFilters,
  type RoadmapResult,
} from "@semogtw/domain";
import { SqliteRoadmapDataSource } from "@semogtw/database";
import { getNodeDatabase } from "./node-auth-composition.server";

const defaultFilters: RoadmapFilters = {
  projectIds: [],
  states: [],
  areas: [],
  includeCompleted: true,
};

export async function readRoadmap(
  filters: RoadmapFilters = defaultFilters,
): Promise<RoadmapResult | null> {
  const database = await getNodeDatabase();
  if (database === null) return null;
  return new RoadmapService(new SqliteRoadmapDataSource(database)).query(filters);
}
