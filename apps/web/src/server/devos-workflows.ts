import {
  SqliteRepositoryTargetOptions,
  SqliteSafeWorkSource,
  SqliteWorkflowOrchestrationReadModel,
} from "@semogtw/database";
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

  const observedAt = new Date().toISOString();
  const model = new SqliteWorkflowOrchestrationReadModel(database);
  const options = new SqliteRepositoryTargetOptions(database);
  const safeWorkSource = new SqliteSafeWorkSource(database);
  const [dashboard, repositoryOptions, safeWork] = await Promise.all([
    model.getDashboard(observedAt),
    options.listWorkflowRepositories(),
    safeWorkSource.evaluate({
      observedAt,
      availableCapabilities: [],
      defaultEstimatedMinutes: 60,
    }),
  ]);

  return { ...dashboard, repositoryOptions, safeWork };
});
