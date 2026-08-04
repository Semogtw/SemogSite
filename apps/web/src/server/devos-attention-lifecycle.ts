import { createSqliteDevOSCommandGateway } from "@semogtw/database/commands";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createDevOSAttentionCommandHandler } from "./devos-attention-command-handler";
import { getNodeDatabase } from "./node-database.server";
import { requireMutationOwner } from "./require-mutation-owner.server";

const AttentionLifecycleSchema = z
  .object({
    csrfToken: z.string().min(1).max(500),
    idempotencyKey: z.string().uuid(),
    attentionId: z.string().trim().min(1).max(200),
    expectedUpdatedAt: z.string().datetime({ offset: true }),
    targetStatus: z.enum(["resolved", "dismissed"]),
    reason: z.string().trim().min(1).max(500),
    confirmed: z.literal(true),
  })
  .strict();

const handleTransitionAttention = createDevOSAttentionCommandHandler({
  authorizeMutation: requireMutationOwner,
  getDatabase: getNodeDatabase,
  createGateway(database) {
    return createSqliteDevOSCommandGateway({
      database,
      now: () => new Date().toISOString(),
      randomUUID: () => crypto.randomUUID(),
    });
  },
});

export const transitionAttentionFn = createServerFn({ method: "POST" })
  .validator(AttentionLifecycleSchema)
  .handler(async ({ data }) => handleTransitionAttention(data));
