import type { WorkflowOrchestrationDashboard } from "@semogtw/database";
import { Hono } from "hono";
import type { ApiEnvironment } from "../../middleware/request-context";

export interface PrivateWorkflowQueries {
  getDashboard(observedAt: string): Promise<WorkflowOrchestrationDashboard>;
}

const emptyWorkflows: PrivateWorkflowQueries = {
  getDashboard: async (observedAt) => ({
    observedAt: new Date(observedAt).toISOString(),
    summary: {
      activeReservations: 0,
      expiredReservations: 0,
      unresolvedObligations: 0,
      environmentBlockedObligations: 0,
    },
    reservations: [],
    obligations: [],
  }),
};

export function createPrivateWorkflowRoutes(
  queries: PrivateWorkflowQueries = emptyWorkflows,
) {
  return new Hono<ApiEnvironment>({ strict: false }).get("/", async (context) => {
    const requested = context.req.query("observedAt")?.trim();
    const observedAt = requested || new Date().toISOString();
    if (Number.isNaN(Date.parse(observedAt))) {
      return context.json(
        {
          ok: false,
          error: {
            code: "INVALID_REQUEST",
            message: "Momento de observação inválido.",
          },
        },
        400,
      );
    }

    return context.json({
      ok: true,
      data: await queries.getDashboard(observedAt),
    });
  });
}
