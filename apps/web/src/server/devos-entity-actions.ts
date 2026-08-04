import { getOwnerEntityActions } from "@semogtw/database/commands";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveCurrentOwner } from "./current-owner.server";
import { createDevOSEntityActionsHandler } from "./devos-entity-actions-handler";
import { getNodeDatabase } from "./node-database.server";

const EntityActionsSchema = z
  .object({
    resourceType: z.string().trim().min(1).max(120),
    resourceId: z.string().trim().min(1).max(200),
  })
  .strict();

const handleGetEntityActions = createDevOSEntityActionsHandler({
  resolveOwner: resolveCurrentOwner,
  getDatabase: getNodeDatabase,
  getActions(database, input) {
    return getOwnerEntityActions({ database, ...input });
  },
});

export const getOwnerEntityActionsFn = createServerFn({ method: "GET" })
  .validator(EntityActionsSchema)
  .handler(async ({ data }) => handleGetEntityActions(data));
