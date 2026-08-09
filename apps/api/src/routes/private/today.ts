import type { TodayQueue } from "@semogtw/domain";
import { Hono } from "hono";
import type { ApiEnvironment } from "../../middleware/request-context";

export interface PrivateTodayQueries {
  getQueue(): Promise<TodayQueue>;
}

const emptyToday: PrivateTodayQueries = {
  getQueue: async () => ({
    executeNow: [],
    nextInQueue: [],
    needsOwner: [],
    externalDependencies: [],
    recentActivity: [],
  }),
};

export function createPrivateTodayRoutes(
  queries: PrivateTodayQueries = emptyToday,
) {
  return new Hono<ApiEnvironment>({ strict: false }).get(
    "/",
    async (context) => context.json({ ok: true, data: await queries.getQueue() }),
  );
}
