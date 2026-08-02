import { SqliteAuditDataSource } from "@semogtw/database";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveCurrentOwner } from "./current-owner.server";
import { getNodeDatabase } from "./node-database.server";

const AuditQuerySchema = z.object({
  page: z.number().int().min(1).max(100_000),
  pageSize: z.number().int().min(1).max(100),
  action: z.string().trim().max(200).nullable(),
  entityType: z.string().trim().max(200).nullable(),
});

export const getAuditPageFn = createServerFn({ method: "GET" })
  .validator(AuditQuerySchema)
  .handler(async ({ data }) => {
    const owner = await resolveCurrentOwner();
    if (owner === null) throw redirect({ to: "/devos/login" });

    const database = await getNodeDatabase();
    if (database === null) throw new Error("AUDIT_STORAGE_UNAVAILABLE");

    const source = new SqliteAuditDataSource(database);
    return source.list({
      page: data.page,
      pageSize: data.pageSize,
      ...(data.action ? { action: data.action } : {}),
      ...(data.entityType ? { entityType: data.entityType } : {}),
    });
  });
