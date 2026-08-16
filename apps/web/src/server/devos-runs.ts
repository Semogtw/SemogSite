import {
  SqliteRepositoryTargetOptions,
  type SqliteDatabase,
} from "@semogtw/database";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { resolveCurrentOwner } from "./current-owner.server";
import { getNodeDatabase } from "./node-database.server";

async function requireRunDatabase(): Promise<SqliteDatabase> {
  const owner = await resolveCurrentOwner();
  if (owner === null) throw redirect({ to: "/devos/login" });

  const database = await getNodeDatabase();
  if (database === null) throw new Error("RUN_STORAGE_UNAVAILABLE");
  return database;
}

export const getCooperativeRunRegistrationOptionsFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const database = await requireRunDatabase();
  return new SqliteRepositoryTargetOptions(database).listProjects();
});
