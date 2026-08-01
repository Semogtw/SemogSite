import {
  SqliteGitHubSyncReadModel,
  SqliteRepositoryTargetOptions,
} from "@semogtw/database";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { resolveCurrentOwner } from "./current-owner.server";
import { getNodeDatabase } from "./node-database.server";

export const getGitHubSyncDashboardFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const owner = await resolveCurrentOwner();
    if (owner === null) throw redirect({ to: "/devos/login" });

    const database = await getNodeDatabase();
    if (database === null) throw new Error("GITHUB_SYNC_STORAGE_UNAVAILABLE");

    const model = new SqliteGitHubSyncReadModel(database);
    const options = new SqliteRepositoryTargetOptions(database);
    return {
      configured: Boolean(process.env.SEMOGTW_GITHUB_TOKEN?.trim()),
      dashboard: await model.getDashboard(),
      projects: await options.listProjects(),
    };
  },
);
