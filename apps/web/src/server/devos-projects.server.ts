import {
  ProjectService,
  type OperationalPortfolio,
  type ProjectHub,
} from "@semogtw/domain";
import { SqliteProjectDataSource } from "@semogtw/database";
import { getNodeDatabase } from "./node-database.server";

async function getProjectService(): Promise<ProjectService | null> {
  const database = await getNodeDatabase();
  if (database === null) return null;
  return new ProjectService(new SqliteProjectDataSource(database));
}

export async function readOperationalPortfolio(): Promise<OperationalPortfolio | null> {
  const service = await getProjectService();
  return service?.listOperationalPortfolio() ?? null;
}

export async function readProjectHub(slug: string): Promise<ProjectHub | null> {
  const service = await getProjectService();
  return service?.getProjectHub(slug) ?? null;
}
