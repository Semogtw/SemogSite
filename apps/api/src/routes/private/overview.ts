import type { DevOSOverview } from "@semogtw/domain";
import { Hono } from "hono";
import type { ApiEnvironment } from "../../middleware/request-context";

export interface PrivateOverviewQueries {
  getOverview(): Promise<DevOSOverview>;
}

const emptyOverview: PrivateOverviewQueries = {
  getOverview: async () => ({
    activeProjectCount: 0,
    inProgressStageCount: 0,
    highImpactAttentionCount: 0,
    projects: [],
    currentStages: [],
    attention: [],
    lastSyncedAt: null,
  }),
};

export function createPrivateOverviewRoutes(
  queries: PrivateOverviewQueries = emptyOverview,
) {
  return new Hono<ApiEnvironment>().get("/", async (context) =>
    context.json({ ok: true, data: await queries.getOverview() }),
  );
}
