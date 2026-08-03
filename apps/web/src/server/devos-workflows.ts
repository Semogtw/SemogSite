import { SqliteWorkflowOrchestrationReadModel } from "@semogtw/database";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { resolveCurrentOwner } from "./current-owner.server";
import { getNodeDatabase } from "./node-database.server";

export const getWorkflowOrchestrationDashboardFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const owner = await resolveCurrentOwner();
  if (owner === null) throw redirect({ to: "/devos/login" });

  const database = await getNodeDatabase();
  if (database === null) {
    throw new Error("WORKFLOW_ORCHESTRATION_STORAGE_UNAVAILABLE");
  }

  const model = new SqliteWorkflowOrchestrationReadModel(database);
  return model.getDashboard(new Date().toISOString());
});
