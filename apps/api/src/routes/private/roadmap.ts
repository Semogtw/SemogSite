import type { RoadmapResult } from "@semogtw/domain";
import { Hono } from "hono";
import type { ApiEnvironment } from "../../middleware/request-context";

export interface PrivateRoadmapQueries {
  getRoadmap(): Promise<RoadmapResult>;
}

const emptyRoadmap: PrivateRoadmapQueries = {
  getRoadmap: async () => ({
    items: [],
    board: {
      backlog: [],
      next: [],
      in_progress: [],
      blocked: [],
      completed: [],
    },
  }),
};

export function createPrivateRoadmapRoutes(
  queries: PrivateRoadmapQueries = emptyRoadmap,
) {
  return new Hono<ApiEnvironment>({ strict: false }).get(
    "/",
    async (context) => context.json({ ok: true, data: await queries.getRoadmap() }),
  );
}
