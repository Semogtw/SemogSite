import {
  SqliteCooperativeRunReadModel,
  SqliteRepositoryTargetOptions,
  type SqliteDatabase,
} from "@semogtw/database";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveCurrentOwner } from "./current-owner.server";
import { getNodeDatabase } from "./node-database.server";

const RunListQuerySchema = z.object({
  limit: z.number().int().min(1).max(100),
});

const RunDetailQuerySchema = z.object({
  runId: z.string().trim().min(1).max(200),
});

async function requireRunDatabase(): Promise<SqliteDatabase> {
  const owner = await resolveCurrentOwner();
  if (owner === null) throw redirect({ to: "/devos/login" });

  const database = await getNodeDatabase();
  if (database === null) throw new Error("RUN_STORAGE_UNAVAILABLE");
  return database;
}

export const getCooperativeRunsFn = createServerFn({ method: "GET" })
  .validator(RunListQuerySchema)
  .handler(async ({ data }) => {
    const database = await requireRunDatabase();
    return new SqliteCooperativeRunReadModel(database).listRuns({
      observedAt: new Date().toISOString(),
      limit: data.limit,
    });
  });

export const getCooperativeRunDetailFn = createServerFn({ method: "GET" })
  .validator(RunDetailQuerySchema)
  .handler(async ({ data }) => {
    const database = await requireRunDatabase();
    return new SqliteCooperativeRunReadModel(database).getRun(
      data.runId,
      new Date().toISOString(),
    );
  });

export const getCooperativeRunRegistrationOptionsFn = createServerFn({
  method: "GET",
}).handler(async () => {
  const database = await requireRunDatabase();
  return new SqliteRepositoryTargetOptions(database).listProjects();
});
