import { CSRF_COOKIE_NAME } from "@semogtw/auth";
import {
  CheckpointWeightRebalanceService,
} from "@semogtw/domain/growth";
import {
  SqliteCheckpointWeightRebalanceRepository,
} from "@semogtw/database/growth";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createDevOSGrowthWeightRebalanceHandlers } from "./devos-growth-weight-rebalance-handlers";
import { resolveCurrentOwner } from "./current-owner.server";
import { getNodeDatabase } from "./node-database.server";
import { requireMutationOwner } from "./require-mutation-owner.server";

const handlers = createDevOSGrowthWeightRebalanceHandlers({
  async resolveOwner() {
    const owner = await resolveCurrentOwner();
    return owner === null ? null : { id: owner.id, sessionId: owner.sessionId };
  },
  async authorizeMutation(csrfToken) {
    const owner = await requireMutationOwner(csrfToken);
    return owner === null ? null : { id: owner.id, sessionId: owner.sessionId };
  },
  async createService() {
    const database = await getNodeDatabase();
    if (database === null) throw new Error("GROWTH_STORAGE_UNAVAILABLE");
    return new CheckpointWeightRebalanceService(
      new SqliteCheckpointWeightRebalanceRepository(database),
      { now: () => new Date().toISOString() },
    );
  },
  nextCorrelationId: () => crypto.randomUUID(),
});

const GoalIdSchema = z.string().trim().min(1).max(200);
const ExpectedCheckpointVersionSchema = z
  .object({
    id: z.string().trim().min(1).max(200),
    version: z.number().int().positive(),
  })
  .strict();

export const PreviewGrowthWeightRebalanceRequestSchema = z
  .object({ goalId: GoalIdSchema })
  .strict();

export const ApplyGrowthWeightRebalanceRequestSchema = z
  .object({
    csrfToken: z.string().trim().min(1).max(500),
    idempotencyKey: z.string().uuid(),
    goalId: GoalIdSchema,
    expectedGoalVersion: z.number().int().positive(),
    expectedCheckpointVersions: z
      .array(ExpectedCheckpointVersionSchema)
      .min(1)
      .max(100),
    reason: z.string().trim().min(1).max(500),
    confirmed: z.boolean(),
  })
  .strict();

export const previewGrowthWeightRebalanceFn = createServerFn({ method: "GET" })
  .validator(PreviewGrowthWeightRebalanceRequestSchema)
  .handler(async ({ data }) => handlers.preview(data));

export const applyGrowthWeightRebalanceFn = createServerFn({ method: "POST" })
  .validator(ApplyGrowthWeightRebalanceRequestSchema)
  .handler(async ({ data }) => handlers.apply(data));

export { CSRF_COOKIE_NAME };
