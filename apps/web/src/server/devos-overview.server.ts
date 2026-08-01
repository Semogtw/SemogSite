import { OverviewService, type DevOSOverview } from "@semogtw/domain";
import { SqliteOverviewDataSource } from "@semogtw/database";
import { getNodeDatabase } from "./node-database.server";

export async function readDevOSOverview(): Promise<DevOSOverview | null> {
  const database = await getNodeDatabase();
  if (database === null) return null;

  return new OverviewService(
    new SqliteOverviewDataSource(database),
  ).getOverview();
}
