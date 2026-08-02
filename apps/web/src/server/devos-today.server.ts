import { TodayService, type TodayQueue } from "@semogtw/domain";
import { SqliteTodayDataSource } from "@semogtw/database";
import { getNodeDatabase } from "./node-database.server";

export async function readTodayQueue(): Promise<TodayQueue | null> {
  const database = await getNodeDatabase();
  if (database === null) return null;
  return new TodayService(new SqliteTodayDataSource(database)).getQueue();
}
